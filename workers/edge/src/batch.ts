import { UPSTREAM_USER_AGENT } from './hyphen-path'
import {
  batchEntry,
  HYPHEN_BATCH_MAX,
  hyphenBatchRead,
  json,
  PROXY_HEADERS,
  type BatchEntry,
} from './proxy'

export const BATCH_PATH = '/x/batch'

/** The census API, reached through a service binding to its Worker when there is one (`RADAR` in wrangler.jsonc). */
export const RADAR_API = 'https://radar.dashhq.org/api/v1'
export const PE_API: Record<string, string> = {
  mainnet: 'https://api.pe.dashhq.org',
  testnet: 'https://api.testnet.pe.dashhq.org',
}

export interface BatchEnv {
  RADAR?: Fetcher
  /** `off` leaves Platform Explorer out of `/x/batch`: its reads answer `not_batched` and go out on their own. */
  BATCH_PE?: string
}

const PROTX = '[0-9a-fA-F]{64}'
/** Radar's GET reads, as `apps/web/src/data/radar/client.ts` makes them. */
const RADAR_READ = new RegExp(
  `^(?:status|health|releases|(?:mainnet|testnet)/(?:summary|history|geo|bench|platform|activation|changes|masternodes(?:/${PROTX}(?:/(?:payments|bench))?)?))$`,
)
/** Platform Explorer's GET reads, by their first segment, as `apps/web/src/data/pe/client.ts` makes them. */
const PE_ROOTS = new Set([
  'status',
  'rate',
  'blocks',
  'block',
  'contestedResources',
  'contestedResource',
  'dataContracts',
  'dataContract',
  'document',
  'epoch',
  'identities',
  'identity',
  'masternodes',
  'platformAddresses',
  'platformAddress',
  'search',
  'tokens',
  'token',
  'transactions',
  'transaction',
  'validators',
  'validator',
])
/** A path segment as `encodeURIComponent` leaves it; an escaped slash, backslash or dot is refused. */
const SEGMENT = /^(?:[A-Za-z0-9_.~!*'()-]|%(?!2[eEfF]|5[cC])[0-9A-Fa-f]{2})+$/
const MAX_SEGMENTS = 6
const MAX_QUERY = 2_000

/** Each line goes out when its read is done, so a read may take nearly as long as the page waits for it alone (10 s). */
const SOURCES_READ_TIMEOUT_MS = 9_000

const refuse = (status: number, error: string): BatchEntry => ({ status, body: { error } })
/** A read this batch does not carry; the page sends it on its own (`sharedGet`). */
const notBatched = (): BatchEntry => refuse(400, 'not_batched')

function split(path: string): { segments: string[]; search: string } | null {
  const [pathname = '', search = ''] = path.split(/\?(.*)/s, 2)
  if (search.length > MAX_QUERY) return null
  const segments = pathname.split('/')
  const ok =
    segments.length <= MAX_SEGMENTS &&
    segments.every((s) => SEGMENT.test(s) && s !== '.' && s !== '..')
  return ok ? { segments, search } : null
}

async function upstream(url: string, accept: Headers, via?: Fetcher): Promise<BatchEntry> {
  const headers = new Headers({ 'user-agent': UPSTREAM_USER_AGENT })
  headers.set('accept', accept.get('accept') ?? 'application/json')
  const init: RequestInit = {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(SOURCES_READ_TIMEOUT_MS),
  }
  let res: Response
  try {
    res = await (via ? via.fetch(url, init) : fetch(url, init))
  } catch {
    return refuse(502, 'upstream_unavailable')
  }
  if (res.status >= 300 && res.status < 400) {
    res.body?.cancel().catch(() => undefined)
    return refuse(502, 'bad_upstream_type')
  }
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (type !== 'application/json' && res.status !== 204) {
    res.body?.cancel().catch(() => undefined)
    return res.ok ? refuse(502, 'bad_upstream_type') : refuse(res.status, 'upstream_error')
  }
  return batchEntry(res)
}

/**
 * One read of a cross-source batch: `hy/<net>/<path>` (the Hyphen pass-through), `radar/<path>` (under Radar's
 * `/api/v1/`) or `pe/<net>/<path>` (Platform Explorer), each limited to the reads the app makes.
 */
function readOne(env: BatchEnv, origin: URL, read: string, accept: Headers): Promise<BatchEntry> {
  const [source, ...rest] = read.split('/')
  const path = rest.join('/')
  if (source === 'hy') {
    const [net = '', ...hyPath] = rest
    if (net !== 'mainnet' && net !== 'testnet') return Promise.resolve(notBatched())
    return hyphenBatchRead(net, hyPath.join('/'), origin, accept)
  }
  const parts = split(path)
  if (!parts) return Promise.resolve(notBatched())
  if (source === 'radar' && RADAR_READ.test(parts.segments.join('/'))) {
    return upstream(`${RADAR_API}/${path}`, accept, env.RADAR)
  }
  const [net = '', root = ''] = parts.segments
  if (
    source === 'pe' &&
    env.BATCH_PE !== 'off' &&
    Object.hasOwn(PE_API, net) &&
    PE_ROOTS.has(root)
  ) {
    return upstream(`${PE_API[net]}/${path.slice(net.length + 1)}`, accept)
  }
  return Promise.resolve(notBatched())
}

/**
 * Up to 16 reads from Hyphen, Radar and Platform Explorer in one request (`?r=<read>&r=<read>…`). The answer is
 * NDJSON, one `{ i, status, body, headers }` line per read as soon as that read is done, so a slow source holds up
 * only its own reads, and each read keeps its own status and 6 s limit: a source that is down answers only its own
 * reads with an error. A read the batch does not carry (another source, a path its client never asks for) answers
 * `not_batched` and goes out on its own. A page's first reads cost the zone's rate limit one request.
 */
export function handleSourcesBatch(request: Request, url: URL, env: BatchEnv): Response {
  if (request.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' }, { allow: 'GET' })
  }
  const reads = url.searchParams.getAll('r')
  if (reads.length === 0 || reads.length > HYPHEN_BATCH_MAX)
    return json(400, { error: 'bad_batch' })
  const accept = new Headers()
  const wanted = request.headers.get('accept')
  if (wanted && wanted !== NDJSON) accept.set('accept', wanted)
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const once = new Map<string, Promise<BatchEntry>>()
  const done = reads.map((read, i) => {
    let entry = once.get(read)
    if (!entry) {
      entry = readOne(env, url, read, accept).catch((e: unknown) => {
        console.error('batch read failed', read, e)
        return refuse(502, 'upstream_unavailable')
      })
      once.set(read, entry)
    }
    return entry.then((e) => writer.write(encoder.encode(`${JSON.stringify({ i, ...e })}\n`)))
  })
  void Promise.all(done)
    .catch(() => undefined)
    .finally(() => writer.close().catch(() => undefined))
  return new Response(readable, {
    headers: { 'content-type': NDJSON, 'cache-control': 'no-store', ...PROXY_HEADERS },
  })
}

const NDJSON = 'application/x-ndjson'
