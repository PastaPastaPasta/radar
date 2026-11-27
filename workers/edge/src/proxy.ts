import { resolveHyphenRequest, UPSTREAM_USER_AGENT } from './hyphen-path'

const FORWARD_REQUEST = ['accept', 'if-none-match']
const KEEP_RESPONSE = ['etag', 'last-modified', 'content-language', 'vary']
const LIST_TTL_SECONDS = 15
/** Raw bytes by hash: the browser checks them against the hash, and they cannot change. */
const IMMUTABLE_TTL_SECONDS = 86_400
const UPSTREAM_TIMEOUT_MS = 10_000

const NDJSON = 'application/x-ndjson'
const BODYLESS = new Set([204, 205, 304])

export function isProxyPath(pathname: string): boolean {
  return pathname.startsWith('/x/hy/')
}

const PROXY_HEADERS = {
  'content-security-policy': "default-src 'none'; sandbox",
  'cross-origin-resource-policy': 'same-origin',
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...PROXY_HEADERS, ...headers },
  })
}

function mediaType(res: Response): string {
  return (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
}

function isJson(type: string): boolean {
  return type === 'application/json' || /^application\/[a-z0-9.!#$&^_-]+\+json$/.test(type)
}

/** The type Radar's origin may serve for this body, or null when it is not a data format the app reads. */
function allowedType(type: string, isStream: boolean): string | null {
  if (isJson(type)) return type
  return isStream && type === NDJSON ? NDJSON : null
}

/** As many reads as one batch may carry (`HYPHEN_BATCH_MAX` in `apps/web/src/data/shared-get.ts`). */
export const HYPHEN_BATCH_MAX = 16
const BATCH_PATH = /^\/x\/hy\/(mainnet|testnet)\/batch$/
const BATCH_KEEP = ['etag', 'last-modified']
/** Under the browser's 10 s, so one slow read comes back as its own 502 instead of timing out the whole batch. */
export const BATCH_READ_TIMEOUT_MS = 6_000

export interface BatchEntry {
  status: number
  body: unknown
  headers?: Record<string, string>
}

/** A batch's answer to one read, from a response the read got on its own. */
export async function batchEntry(res: Response): Promise<BatchEntry> {
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    return { status: 502, body: { error: 'bad_upstream_type' } }
  }
  const headers: Record<string, string> = {}
  for (const name of BATCH_KEEP) {
    const v = res.headers.get(name)
    if (v) headers[name] = v
  }
  return { status: res.status, body, headers }
}

/** One Hyphen read of a batch (`<path>` under `/x/hy/<net>/`), through the pass-through's checks and edge cache. */
export async function hyphenBatchRead(
  net: string,
  path: string,
  origin: URL,
  accept: Headers,
): Promise<BatchEntry> {
  const [pathname = '', search = ''] = path.split(/\?(.*)/s, 2)
  const sub = new URL(`/x/hy/${net}/${pathname}`, origin)
  sub.search = search
  const resolved = resolveHyphenRequest(sub.pathname, sub.search)
  if (!resolved.ok) return { status: resolved.status, body: { error: resolved.error } }
  if (resolved.stream) return { status: 400, body: { error: 'bad_batch' } }
  return batchEntry(
    await handleProxy(new Request(sub, { headers: accept }), sub, BATCH_READ_TIMEOUT_MS),
  )
}

/** The reads of a batch, each once however often it is named, a read that throws answering its own 502. */
export async function answerBatch(
  request: Request,
  paths: readonly string[],
  readOne: (path: string, accept: Headers) => Promise<BatchEntry>,
): Promise<Response> {
  if (paths.length === 0 || paths.length > HYPHEN_BATCH_MAX) {
    return json(400, { error: 'bad_batch' })
  }
  const accept = new Headers()
  const wanted = request.headers.get('accept')
  if (wanted) accept.set('accept', wanted)
  const reads = new Map<string, Promise<BatchEntry>>()
  const read = (path: string) => {
    let entry = reads.get(path)
    // A read that throws (its body cut off by the timeout, a reset, a path the URL parser refuses) is its own 502.
    if (!entry)
      reads.set(
        path,
        (entry = readOne(path, accept).catch((e: unknown) => {
          console.error('batch read failed', path, e)
          return { status: 502, body: { error: 'upstream_unavailable' } }
        })),
      )
    return entry
  }
  return json(200, { results: await Promise.all(paths.map(read)) })
}

/**
 * Several Hyphen reads in one request: `?r=<path>&r=<path>…`, each a path the pass-through serves on its own (a
 * stream excepted), answered in order as `{ results: [{ status, body, headers }] }`. Each read goes through the same
 * checks and the same edge cache as it would alone; the page pays the zone's rate limit once instead of once per read.
 * Pages from before `/x/batch` (`batch.ts`) still send these.
 */
function handleBatch(request: Request, url: URL, net: string): Promise<Response> {
  return answerBatch(request, url.searchParams.getAll('r'), (path, accept) =>
    hyphenBatchRead(net, path, url, accept),
  )
}

export async function handleProxy(
  request: Request,
  url: URL,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' }, { allow: 'GET, HEAD' })
  }
  const batch = BATCH_PATH.exec(url.pathname)
  if (batch) return handleBatch(request, url, batch[1]!)
  const resolved = resolveHyphenRequest(url.pathname, url.search)
  if (!resolved.ok) return json(resolved.status, { error: resolved.error })
  const { url: target, stream: isStream, immutable } = resolved
  const ttl = immutable ? IMMUTABLE_TTL_SECONDS : LIST_TTL_SECONDS

  const headers = new Headers({ 'user-agent': UPSTREAM_USER_AGENT })
  for (const name of FORWARD_REQUEST) {
    const v = request.headers.get(name)
    if (v) headers.set(name, v)
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      signal: isStream ? undefined : AbortSignal.timeout(timeoutMs),
      cf: isStream
        ? { cacheTtl: 0, cacheEverything: false }
        : {
            cacheEverything: true,
            cacheTtlByStatus: { '200-299': ttl, '300-499': 0, '500-599': 0 },
          },
    })
  } catch {
    return json(502, { error: 'upstream_unavailable' })
  }

  const type = allowedType(mediaType(upstream), isStream)
  if (!type && !BODYLESS.has(upstream.status)) {
    upstream.body?.cancel().catch(() => undefined)
    return upstream.ok
      ? json(502, { error: 'bad_upstream_type' })
      : json(upstream.status, { error: 'upstream_error' })
  }

  const out = new Headers(PROXY_HEADERS)
  for (const name of KEEP_RESPONSE) {
    const v = upstream.headers.get(name)
    if (v) out.set(name, v)
  }
  if (type) out.set('content-type', type)
  if (isStream) {
    out.set('cache-control', 'no-store')
    out.set('x-accel-buffering', 'no')
  } else if (upstream.ok) {
    out.set('cache-control', `public, max-age=${ttl}${immutable ? ', immutable' : ''}`)
  } else {
    out.set('cache-control', 'no-store')
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
