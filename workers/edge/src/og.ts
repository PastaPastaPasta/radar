export type OgKind =
  | 'mn'
  | 'block'
  | 'tx'
  | 'identity'
  | 'contract'
  | 'token'
  | 'epoch'
  | 'name'
  | 'contest'
  | 'document'
  | 'platform-block'
  | 'transition'
  | 'platform-address'
  | 'quorum'

/** A link the Worker knows how to describe. `plain` marks one whose title comes from the address alone. */
export interface OgMatch {
  kind: OgKind
  id: string
  plain?: boolean
}

export interface OgMeta {
  title: string
  description: string
}

interface Source {
  id: RegExp
  /** The one backend read that names the entity; none when the address alone names it. */
  fetchUrl?: (net: 'mainnet' | 'testnet', id: string) => string
  /** A read that answers with a list: the entity is the item `pick` finds. */
  pick?: (id: string, body: Record<string, unknown>) => Record<string, unknown> | undefined
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
const rec = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const count = (n: number | undefined, one: string, many: string) =>
  n === undefined ? undefined : `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
const day = (ms: unknown): string | undefined => {
  const t = typeof ms === 'number' ? ms : typeof ms === 'string' ? Date.parse(ms) : NaN
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined
}
const resultSet = (body: Record<string, unknown>): unknown[] =>
  Array.isArray(body.resultSet) ? body.resultSet : []
/** PE's key for a contested name: the base64 of its index values as JSON. */
const contestKey = (label: string) => btoa(JSON.stringify(['dash', label]))

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
  epoch: {
    id: /^\d{1,6}$/,
    fetchUrl: (net, id) => `${PE[net]}/epoch/${id}`,
    describe: (id, b) => {
      const epoch = rec(b.epoch)
      return {
        title: `Epoch ${num(epoch.number) ?? id}`,
        description:
          first(
            day(epoch.startTime) && `starts ${day(epoch.startTime)}`,
            count(num(b.totalTxCount), 'transaction', 'transactions'),
          ) || 'Dash Platform epoch',
      }
    },
    generic: {
      title: 'Epoch',
      description:
        'Dash Platform epoch: time range, blocks, fees and the evonodes that proposed them.',
    },
  },
  name: {
    id: /^[^/\s]{1,63}$/,
    describe: (id) => ({
      title: `Name ${id.replace(/\.dash$/i, '')}.dash`,
      description: 'Dash Platform name: owner, status and contest history.',
    }),
    generic: {
      title: 'Name',
      description: 'Dash Platform name: owner, status and contest history.',
    },
  },
  contest: {
    id: /^[^/\s]{1,63}$/,
    fetchUrl: (net, id) => `${PE[net]}/contestedResource/${encodeURIComponent(contestKey(id))}`,
    describe: (id, b) => ({
      title: `Contest ${id.replace(/\.dash$/i, '')}.dash`,
      description:
        first(
          str(b.status),
          count(num(b.totalCountVotes), 'vote', 'votes'),
          day(b.endTimestamp) && `ends ${day(b.endTimestamp)}`,
        ) || 'Dash Platform name contest',
    }),
    generic: {
      title: 'Name contest',
      description: 'Dash Platform name contest: contenders, votes and when it ends.',
    },
  },
  document: {
    id: new RegExp(`^${BASE58.source.slice(1, -1)}/[^/\\s]{1,64}/${BASE58.source.slice(1, -1)}$`),
    fetchUrl: (net, id) => {
      const [contract, type, doc] = id.split('/')
      const q = new URLSearchParams({ contract_id: contract!, document_type_name: type! })
      return `${PE[net]}/document/${doc}?${q}`
    },
    describe: (id, b) => {
      const [, type, doc] = id.split('/')
      return {
        title: `Document ${type} ${short(doc!)}`,
        description:
          first(
            str(b.documentTypeName),
            num(b.revision) === undefined ? undefined : `revision ${num(b.revision)}`,
          ) || 'Dash Platform document',
      }
    },
    generic: {
      title: 'Document',
      description: 'Dash Platform document: its data, metadata and revision history.',
    },
  },
  'platform-block': {
    id: /^(\d{1,10}|[0-9a-fA-F]{64})$/,
    fetchUrl: (net, id) =>
      HEX64.test(id)
        ? `${PE[net]}/block/${id}`
        : `${PE[net]}/blocks?height_min=${id}&height_max=${id}&limit=1&order=desc`,
    pick: (id, b) => (HEX64.test(id) ? b : rec(resultSet(b)[0])),
    describe: (id, b) => {
      const header = rec(b.header)
      const h = num(header.height)
      const txs = Array.isArray(b.txs) ? b.txs.length : undefined
      return {
        title: `Platform block ${h === undefined ? short(id) : h.toLocaleString('en-US')}`,
        description:
          first(count(txs, 'transition', 'transitions'), str(header.timestamp)) ||
          'Dash Platform block',
      }
    },
    generic: {
      title: 'Platform block',
      description: 'Dash Platform block: proposer, quorum, state transitions and gas.',
    },
  },
  transition: {
    id: HEX64,
    fetchUrl: (net, id) => `${PE[net]}/transaction/${id}`,
    describe: (id, b) => ({
      title: `State transition ${short(id)}`,
      description:
        first(
          str(b.type),
          str(b.status),
          num(b.blockHeight) === undefined ? undefined : `block ${num(b.blockHeight)}`,
        ) || 'Dash Platform state transition',
    }),
    generic: {
      title: 'State transition',
      description: 'Dash Platform state transition: type, status, owner and the data it carried.',
    },
  },
  'platform-address': {
    id: /^(dash|tdash|devnet)1[0-9a-z]{20,120}$/,
    fetchUrl: (net, id) => `${PE[net]}/platformAddress/${id}/info`,
    describe: (id, b) => {
      const credits =
        typeof b.balance === 'string' || typeof b.balance === 'number' ? Number(b.balance) : NaN
      return {
        title: `Platform address ${short(id)}`,
        description: Number.isFinite(credits)
          ? `${(credits / 1e11).toLocaleString('en-US', { maximumFractionDigits: 4 })} DASH on Platform`
          : 'Dash Platform address',
      }
    },
    generic: {
      title: 'Platform address',
      description: 'Dash Platform address: balance, nonce and the transitions that moved it.',
    },
  },
  quorum: {
    id: HEX64,
    fetchUrl: (net) => `${PE[net]}/quorums`,
    pick: (id, b) => {
      const list: unknown[] = Array.isArray(b) ? b : resultSet(b)
      return list.map(rec).find((q) => str(q.quorumHash)?.toLowerCase() === id.toLowerCase())
    },
    describe: (id, b) => ({
      title: `Quorum ${short(id)}`,
      description:
        first(
          str(b.type),
          count(num(b.numValidMembers), 'valid member', 'valid members'),
          num(b.blockHeight) === undefined ? undefined : `height ${num(b.blockHeight)}`,
        ) || 'Dash Platform quorum',
    }),
    generic: {
      title: 'Quorum',
      description: 'Dash quorum: type, members, health and the blocks it signed.',
    },
  },
}

const SEGMENT = '([^/]+)'
const ROUTES: [RegExp, OgKind][] = [
  [new RegExp(`^/mn/${SEGMENT}/?$`), 'mn'],
  [new RegExp(`^/block/${SEGMENT}/?$`), 'block'],
  [new RegExp(`^/tx/${SEGMENT}/?$`), 'tx'],
  [new RegExp(`^/identity/${SEGMENT}/?$`), 'identity'],
  [new RegExp(`^/contract/${SEGMENT}/?$`), 'contract'],
  [new RegExp(`^/token/${SEGMENT}/?$`), 'token'],
  [new RegExp(`^/epoch/${SEGMENT}/?$`), 'epoch'],
  [new RegExp(`^/name/${SEGMENT}/?$`), 'name'],
  [new RegExp(`^/contest/${SEGMENT}/?$`), 'contest'],
  [new RegExp(`^/document/(${SEGMENT}/${SEGMENT}/${SEGMENT})/?$`), 'document'],
  [new RegExp(`^/platform/block/${SEGMENT}/?$`), 'platform-block'],
  [new RegExp(`^/platform/tx/${SEGMENT}/?$`), 'transition'],
  [new RegExp(`^/platform-address/${SEGMENT}/?$`), 'platform-address'],
]
const FETCH_TIMEOUT_MS = 2000
const CACHE_TTL_SECONDS = 300

const LINK_PREVIEW_AGENT =
  /bot|crawler|spider|facebookexternalhit|whatsapp|slack|skypeuripreview|embedly|iframely|quora link preview|vkshare|preview|mastodon|pleroma|bluesky|opengraph/i

/** Link unfurlers and crawlers read the tags from the first response; people never see them. */
export function isLinkPreviewAgent(userAgent: string | null): boolean {
  return userAgent !== null && LINK_PREVIEW_AGENT.test(userAgent)
}

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

/** The entity a page address names, when Radar can describe it. */
export function matchOgRoute(url: URL): OgMatch | null {
  for (const [re, kind] of ROUTES) {
    const m = re.exec(url.pathname)
    if (!m) continue
    const id = decode(m[1]!)
    if (id === null) return null
    // A contest outside DPNS names its contract, type and index, which no backend read here covers.
    if (kind === 'contest' && ['contract', 'type', 'index'].some((k) => url.searchParams.has(k))) {
      return { kind, id, plain: true }
    }
    return { kind, id }
  }
  if (url.pathname.replace(/\/$/, '') === '/quorums') {
    const q = url.searchParams.get('q')
    if (q !== null && HEX64.test(q)) return { kind: 'quorum', id: q.toLowerCase() }
  }
  return null
}

export function genericOg(kind: OgKind): OgMeta {
  return SOURCES[kind].generic
}

export async function resolveOg(match: OgMatch, network: string | null): Promise<OgMeta> {
  const source = SOURCES[match.kind]
  const { id } = match
  if (!source.id.test(id) || match.plain) return source.generic
  if (network !== null && network !== 'mainnet' && network !== 'testnet') return source.generic
  const net = network === 'testnet' ? 'testnet' : 'mainnet'
  if (!source.fetchUrl) return source.describe(id, {})
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
    if (typeof body !== 'object' || body === null) return source.generic
    const found = source.pick
      ? source.pick(
          id,
          Array.isArray(body) ? { resultSet: body } : (body as Record<string, unknown>),
        )
      : Array.isArray(body)
        ? undefined
        : (body as Record<string, unknown>)
    return found && Object.keys(found).length > 0 ? source.describe(id, found) : source.generic
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
