import { resolveHyphenRequest } from './hyphen-path'

const FORWARD_REQUEST = ['accept', 'if-none-match']
// Hyphen answers 520 to requests without a User-Agent, and Workers send none by default.
const UPSTREAM_USER_AGENT = 'Radar/1 (+https://explorer.dashhq.org)'
const KEEP_RESPONSE = ['etag', 'last-modified', 'content-language', 'vary']
const LIST_TTL_SECONDS = 15
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

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
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

export async function handleProxy(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' }, { allow: 'GET, HEAD' })
  }
  const resolved = resolveHyphenRequest(url.pathname, url.search)
  if (!resolved.ok) return json(resolved.status, { error: resolved.error })
  const { url: target, stream: isStream } = resolved

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
      signal: isStream ? undefined : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cf: isStream
        ? { cacheTtl: 0, cacheEverything: false }
        : {
            cacheEverything: true,
            cacheTtlByStatus: { '200-299': LIST_TTL_SECONDS, '300-499': 0, '500-599': 0 },
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
    out.set('cache-control', `public, max-age=${LIST_TTL_SECONDS}`)
  } else {
    out.set('cache-control', 'no-store')
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
