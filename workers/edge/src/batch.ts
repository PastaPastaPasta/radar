import { UPSTREAM_USER_AGENT } from './hyphen-path'
import {
  answerBatch,
  BATCH_READ_TIMEOUT_MS,
  batchEntry,
  hyphenBatchRead,
  json,
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
  /** `off` leaves Platform Explorer out of `/x/batch`; its reads then go out on their own. */
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
const SEGMENT = /^[A-Za-z0-9_.:@=-]+$/
const MAX_SEGMENTS = 6
const MAX_QUERY = 2_000

const refuse = (status: number, error: string): BatchEntry => ({ status, body: { error } })

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
  const init = { headers, signal: AbortSignal.timeout(BATCH_READ_TIMEOUT_MS) }
  let res: Response
  try {
    res = await (via ? via.fetch(url, init) : fetch(url, init))
  } catch {
    return refuse(502, 'upstream_unavailable')
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
    if (net !== 'mainnet' && net !== 'testnet') return Promise.resolve(refuse(400, 'bad_batch'))
    return hyphenBatchRead(net, hyPath.join('/'), origin, accept)
  }
  const parts = split(path)
  if (!parts) return Promise.resolve(refuse(400, 'bad_batch'))
  if (source === 'radar') {
    if (!RADAR_READ.test(parts.segments.join('/'))) return Promise.resolve(refuse(404, 'not_found'))
    const url = `${RADAR_API}/${path}`
    return upstream(url, accept, env.RADAR)
  }
  if (source === 'pe' && env.BATCH_PE !== 'off') {
    const [net = '', root = ''] = parts.segments
    const base = PE_API[net]
    if (!base || !PE_ROOTS.has(root)) return Promise.resolve(refuse(404, 'not_found'))
    return upstream(`${base}/${path.slice(net.length + 1)}`, accept)
  }
  return Promise.resolve(refuse(400, 'bad_batch'))
}

/**
 * Up to 16 reads from Hyphen, Radar and Platform Explorer in one request (`?r=<read>&r=<read>…`), answered in order as
 * `{ results: [{ status, body, headers }] }`, each read with its own status and its own 6 s limit, so one source that is
 * down answers only its own reads with an error. A page's first reads cost the zone's rate limit one request.
 */
export function handleSourcesBatch(request: Request, url: URL, env: BatchEnv): Promise<Response> {
  if (request.method !== 'GET') {
    return Promise.resolve(json(405, { error: 'method_not_allowed' }, { allow: 'GET' }))
  }
  return answerBatch(request, url.searchParams.getAll('r'), (read, accept) =>
    readOne(env, url, read, accept),
  )
}
