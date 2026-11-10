export type OgKind = 'mn' | 'block' | 'tx' | 'identity' | 'contract' | 'token'

export interface OgMeta {
  title: string
  description: string
}

interface Source {
  id: RegExp
  fetchUrl: (net: 'mainnet' | 'testnet', id: string) => string
  describe: (id: string, body: Record<string, unknown>) => OgMeta
  generic: OgMeta
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{42,46}$/
const HEX64 = /^[0-9a-fA-F]{64}$/

const PE = { mainnet: 'https://api.pe.dashhq.org', testnet: 'https://api.testnet.pe.dashhq.org' }
const HY = { mainnet: 'https://hy.kw.vg/api/v1', testnet: 'https://ts.kw.vg/api/v1' }

const short = (id: string) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined
const first = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ')

const SOURCES: Record<OgKind, Source> = {
  mn: {
    id: HEX64,
    fetchUrl: (net, id) => `https://radar.dashhq.org/api/v1/${net}/masternodes/${id}`,
    describe: (id, b) => ({
      title: `${str(b.type) === 'Evo' ? 'Evonode' : 'Masternode'} ${short(id)}`,
      description: first(str(b.status), str(b.version), str(b.country)) || 'Masternode on Dash',
    }),
    generic: {
      title: 'Masternode',
      description: 'Dash masternode: status, version, location and payments.',
    },
  },
  block: {
    id: /^(\d{1,10}|[0-9a-fA-F]{64})$/,
    fetchUrl: (net, id) => `${HY[net]}/block/${id}`,
    describe: (id, b) => {
      const h = num(b.blockHeight)
      const txs = num(b.txCount)
      return {
        title: `Block ${h === undefined ? short(id) : h.toLocaleString('en-US')}`,
        description:
          first(txs === undefined ? undefined : `${txs} transactions`, str(b.blockTime)) ||
          'Dash Core block',
      }
    },
    generic: {
      title: 'Block',
      description: 'Dash Core block: header, ChainLock, special transactions and rewards.',
    },
  },
  tx: {
    id: HEX64,
    fetchUrl: (net, id) => `${HY[net]}/tx/${id}`,
    describe: (id, b) => ({
      title: `Transaction ${short(id)}`,
      description:
        first(
          str(b.txType),
          num(b.blockHeight) === undefined ? undefined : `block ${num(b.blockHeight)}`,
        ) || 'Dash transaction',
    }),
    generic: {
      title: 'Transaction',
      description: 'Dash transaction: inputs, outputs, InstantSend and ChainLock state.',
    },
  },
  identity: {
    id: BASE58,
    fetchUrl: (net, id) => `${PE[net]}/identity/${id}`,
    describe: (id, b) => {
      const aliases = Array.isArray(b.aliases) ? (b.aliases as { alias?: unknown }[]) : []
      const name = str(aliases[0]?.alias)
      return {
        title: `Identity ${name ?? short(id)}`,
        description: first(name ? short(id) : undefined, 'Dash Platform identity'),
      }
    },
    generic: {
      title: 'Identity',
      description: 'Dash Platform identity: balance, keys, names and tokens.',
    },
  },
  contract: {
    id: BASE58,
    fetchUrl: (net, id) => `${PE[net]}/dataContract/${id}`,
    describe: (id, b) => ({
      title: `Contract ${str(b.name) ?? short(id)}`,
      description: first(str(b.description), 'Dash Platform data contract'),
    }),
    generic: {
      title: 'Contract',
      description: 'Dash Platform data contract: schema, document types and tokens.',
    },
  },
  token: {
    id: BASE58,
    fetchUrl: (net, id) => `${PE[net]}/token/${id}`,
    describe: (id, b) => {
      const loc = (b.localizations as Record<string, { singularForm?: unknown }> | undefined)?.en
      return {
        title: `Token ${str(loc?.singularForm) ?? short(id)}`,
        description: first(str(b.description), 'Dash Platform token'),
      }
    },
    generic: {
      title: 'Token',
      description: 'Dash Platform token: supply, price, holders and activity.',
    },
  },
}

const ROUTE = /^\/(mn|block|tx|identity|contract|token)\/([^/]+)\/?$/
const FETCH_TIMEOUT_MS = 2000
const CACHE_TTL_SECONDS = 300

const LINK_PREVIEW_AGENT =
  /bot|crawler|spider|facebookexternalhit|whatsapp|slack|skypeuripreview|embedly|iframely|quora link preview|vkshare|preview|mastodon|pleroma|bluesky|opengraph/i

/** Link unfurlers and crawlers read the tags from the first response; people never see them. */
export function isLinkPreviewAgent(userAgent: string | null): boolean {
  return userAgent !== null && LINK_PREVIEW_AGENT.test(userAgent)
}

export function matchOgRoute(pathname: string): { kind: OgKind; id: string } | null {
  const m = ROUTE.exec(pathname)
  if (!m) return null
  const kind = m[1] as OgKind
  let id: string
  try {
    id = decodeURIComponent(m[2]!)
  } catch {
    return null
  }
  return { kind, id }
}

export function genericOg(kind: OgKind): OgMeta {
  return SOURCES[kind].generic
}

export async function resolveOg(kind: OgKind, id: string, network: string | null): Promise<OgMeta> {
  const source = SOURCES[kind]
  if (!source.id.test(id)) return source.generic
  if (network !== null && network !== 'mainnet' && network !== 'testnet') return source.generic
  const net = network === 'testnet' ? 'testnet' : 'mainnet'
  try {
    const res = await fetch(source.fetchUrl(net, id), {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: { '200-299': CACHE_TTL_SECONDS, '300-599': 0 },
      },
    })
    if (!res.ok) return source.generic
    const body: unknown = await res.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return source.generic
    return source.describe(id, body as Record<string, unknown>)
  } catch {
    return source.generic
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function rewriteHead(res: Response, meta: OgMeta, canonicalUrl: string): Response {
  const title = `${meta.title} · Radar`
  const tags = [
    ['description', meta.description],
    ['og:title', title],
    ['og:description', meta.description],
    ['og:type', 'website'],
    ['og:site_name', 'Radar'],
    ['og:url', canonicalUrl],
    ['twitter:card', 'summary'],
  ]
    .map(
      ([k, v]) =>
        `<meta ${k!.startsWith('og:') ? 'property' : 'name'}="${k}" content="${esc(v!)}">`,
    )
    .join('')
  const out = new Response(res.body, res)
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  return new HTMLRewriter()
    .on('title', { element: (el) => void el.setInnerContent(title) })
    .on('head', { element: (el) => void el.append(tags, { html: true }) })
    .transform(out)
}
