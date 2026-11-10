export const HYPHEN_API_BASE = {
  mainnet: 'https://hy.kw.vg/api/v1/',
  testnet: 'https://ts.kw.vg/api/v1/',
} as const

export type HyphenNetwork = keyof typeof HYPHEN_API_BASE

const SEGMENT = '[^/]+'

const ALLOWED_PATHS = new RegExp(
  `^(?:${[
    'blocks',
    'balances',
    'status',
    'network',
    'mempool',
    'mempool/txs',
    'metrics/latest',
    'metrics/chart',
    'proposals',
    'validators',
    'search',
    'stream',
    `(?:block|rawblock|tx|rawtx|address|proposal|validator)/${SEGMENT}`,
    `block/${SEGMENT}/txs`,
    `address/${SEGMENT}/(?:txs|utxos)`,
    `proposal/${SEGMENT}/votes`,
  ].join('|')})$`,
)

export const HYPHEN_PARAMS = ['limit', 'cursor', 'blocks', 'points', 'q', 'status', 'type'] as const

export type HyphenParam = (typeof HYPHEN_PARAMS)[number]

const ALLOWED_PARAMS: ReadonlySet<string> = new Set(HYPHEN_PARAMS)
const MAX_QUERY_LENGTH = 1024
const MAX_VALUE_LENGTH = 256

const UNSAFE_PATH = /%2f|%5c|\\|(^|\/)(\.|%2e){1,2}(\/|$)/i
const PREFIX = /^\/x\/hy\/(mainnet|testnet)\/(.*)$/

export type HyphenRequest =
  | { ok: true; network: HyphenNetwork; url: URL; stream: boolean }
  | { ok: false; status: 400 | 404; error: string }

function cleanSearch(search: string): string | null {
  if (search.length > MAX_QUERY_LENGTH) return null
  const kept = new URLSearchParams()
  const seen = new Set<string>()
  for (const [name, value] of new URLSearchParams(search)) {
    if (!ALLOWED_PARAMS.has(name) || seen.has(name)) continue
    if (value.length > MAX_VALUE_LENGTH) return null
    seen.add(name)
    kept.set(name, value)
  }
  kept.sort()
  const text = kept.toString()
  return text ? `?${text}` : ''
}

/** Maps a public `/x/hy/{net}/…` request onto the Hyphen API, or says why it must be refused. */
export function resolveHyphenRequest(pathname: string, search: string): HyphenRequest {
  const m = PREFIX.exec(pathname)
  const network = m?.[1] as HyphenNetwork | undefined
  if (!m || !network) return { ok: false, status: 404, error: 'unknown_network' }

  const rest = m[2] ?? ''
  if (UNSAFE_PATH.test(rest)) return { ok: false, status: 400, error: 'bad_path' }

  const base = new URL(HYPHEN_API_BASE[network])
  const target = new URL(rest, base)
  if (!target.pathname.startsWith(base.pathname) || target.host !== base.host) {
    return { ok: false, status: 400, error: 'bad_path' }
  }
  const apiPath = target.pathname.slice(base.pathname.length)
  if (!ALLOWED_PATHS.test(apiPath)) return { ok: false, status: 404, error: 'unknown_path' }

  const cleaned = cleanSearch(search)
  if (cleaned === null) return { ok: false, status: 400, error: 'bad_query' }
  target.search = cleaned
  return { ok: true, network, url: target, stream: apiPath === 'stream' }
}
