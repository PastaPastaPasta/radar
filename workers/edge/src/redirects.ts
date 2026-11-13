export interface RedirectOptions {
  nativeHosts: readonly string[]
}

interface Hit {
  path: string
  drop?: string[]
  set?: Record<string, string>
}

type Rule = (p: URLSearchParams) => Hit | null

const seg = (v: string) => encodeURIComponent(v)

const TOOLS: Record<string, string> = {
  'state-transition': 'transition',
  contract: 'contract',
  document: 'document',
  identity: 'identity',
  proof: 'proof',
  'path-elements': 'path',
}

function toolPath(tool: string | null): string {
  return tool !== null && Object.hasOwn(TOOLS, tool) ? TOOLS[tool]! : 'transition'
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** The native explorer's tab names, where the new pages call them something else; an unknown tab is dropped. */
function tabSet(p: URLSearchParams, names: Record<string, string>): Record<string, string> {
  const tab = names[(p.get('tab') ?? '').toLowerCase()]
  return tab ? { tab } : {}
}

const IDENTITY_TABS = {
  keys: 'keys',
  dpns: 'names',
  names: 'names',
  tokens: 'tokens',
  groups: 'groups',
  votes: 'votes',
  advanced: 'advanced',
}
const CONTRACT_TABS = {
  schema: 'schema',
  documents: 'types',
  tokens: 'tokens',
  groups: 'groups',
  history: 'history',
  internal: 'config',
}
const DOCUMENT_TABS = { data: 'data', metadata: 'meta', history: 'revisions' }
const TOKEN_TABS = { definition: 'definition', holders: 'holders', balance: 'balance' }
const POLL_WINDOWS: Record<string, string> = {
  '24h': '24h',
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  'all-upcoming': 'upcoming',
  custom: 'custom',
}

const WHERE_OPS: Record<string, string> = {
  '==': 'eq',
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte',
  in: 'in',
  startsWith: 'sw',
}

const wherePart = (s: string) => encodeURIComponent(s).replace(/~/g, '%7E')

/**
 * The native explorer's `where` is JSON, `[["field","==","value"]]`, with `in` values as a comma list;
 * the documents page reads `field~op~value` clauses joined by commas, with `in` values joined by `|`.
 */
function whereOf(raw: string | null): string | null {
  if (!raw) return null
  const rows = parseJson(raw)
  if (!Array.isArray(rows)) return null
  const clauses: string[] = []
  for (const row of rows as unknown[]) {
    if (!Array.isArray(row) || row.length !== 3) continue
    const [field, op, value] = row as unknown[]
    if (
      typeof field !== 'string' ||
      !field ||
      typeof op !== 'string' ||
      typeof value !== 'string'
    ) {
      continue
    }
    const mapped = Object.hasOwn(WHERE_OPS, op) ? WHERE_OPS[op]! : undefined
    if (!mapped) continue
    const text =
      mapped === 'in'
        ? value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
            .map(wherePart)
            .join('|')
        : wherePart(value)
    if (text) clauses.push(`${wherePart(field)}~${mapped}~${text}`)
  }
  return clauses.length > 0 ? clauses.join(',') : null
}

/** The native explorer keeps a stack of page cursors in `after`, newest last. */
const cursorsOf = (p: URLSearchParams): string[] =>
  (p.get('after') ?? '').split(',').filter(Boolean)

/** The native explorer's documents paging and ordering, in the page's own address form. */
function documentsSearch(p: URLSearchParams): Record<string, string> {
  const set: Record<string, string> = {}
  const where = whereOf(p.get('where'))
  if (where) set.where = where
  const order = p.get('order')
  if (order) {
    const at = order.lastIndexOf(':')
    const field = at > 0 ? order.slice(0, at) : order
    if (field) set.order = order.slice(at + 1) === 'desc' && at > 0 ? `-${field}` : field
  }
  const cursors = cursorsOf(p)
  const last = cursors.pop()
  if (last) set.after = last
  if (cursors.length > 0) set.prev = cursors.join(',')
  return set
}

const DOCUMENT_DROPS = ['id', 'type', 'where', 'order', 'after']

function contestLabel(p: URLSearchParams): string | null {
  if (p.get('docType') !== 'domain' || p.get('indexName') !== 'parentNameAndLabel') return null
  const raw = p.get('indexValues')
  if (!raw) return null
  let values = parseJson(raw)
  if (values === undefined) {
    try {
      values = parseJson(decodeURIComponent(raw))
    } catch {
      return null
    }
  }
  if (!Array.isArray(values)) return null
  const [parent, label] = values as unknown[]
  return parent === 'dash' && typeof label === 'string' && label ? label : null
}

const NATIVE: Record<string, Rule> = {
  '/identity': (p) =>
    p.get('id')
      ? {
          path: `/identity/${seg(p.get('id')!)}`,
          drop: ['id', 'tab'],
          set: tabSet(p, IDENTITY_TABS),
        }
      : { path: '/identities', drop: ['tab'] },
  '/identity/lookup': () => ({ path: '/identity/lookup' }),
  '/contract': (p) =>
    p.get('id')
      ? {
          path: `/contract/${seg(p.get('id')!)}`,
          drop: ['id', 'tab'],
          set: tabSet(p, CONTRACT_TABS),
        }
      : { path: '/contracts', drop: ['tab'] },
  '/contract/documents': (p) =>
    p.get('id') && p.get('type')
      ? {
          path: `/contract/${seg(p.get('id')!)}/documents/${seg(p.get('type')!)}`,
          drop: DOCUMENT_DROPS,
          set: documentsSearch(p),
        }
      : { path: '/contracts', drop: DOCUMENT_DROPS },
  '/contract/document': (p) =>
    p.get('id') && p.get('type') && p.get('docId')
      ? {
          path: `/document/${seg(p.get('id')!)}/${seg(p.get('type')!)}/${seg(p.get('docId')!)}`,
          drop: ['id', 'type', 'docId', 'tab'],
          set: tabSet(p, DOCUMENT_TABS),
        }
      : { path: '/contracts', drop: ['tab'] },
  '/contract/token': (p) =>
    p.get('id')
      ? { path: `/contract/${seg(p.get('id')!)}`, drop: ['id', 'position'], set: { tab: 'tokens' } }
      : { path: '/tokens', drop: ['position'] },
  '/token': (p) =>
    p.get('id')
      ? { path: `/token/${seg(p.get('id')!)}`, drop: ['id', 'tab'], set: tabSet(p, TOKEN_TABS) }
      : { path: '/tokens', drop: ['tab'] },
  '/token/holders': (p) =>
    p.get('id')
      ? { path: `/token/${seg(p.get('id')!)}/holders`, drop: ['id'] }
      : { path: '/tokens' },
  '/dpns': (p) =>
    p.get('name')
      ? { path: `/name/${seg(p.get('name')!.replace(/\.dash$/i, ''))}`, drop: ['name'] }
      : { path: '/names' },
  '/dpns/search': (p) => {
    const after = cursorsOf(p).at(-1)
    const set: Record<string, string> = {}
    if (after) set.after = after
    return { path: '/names', drop: ['after'], set }
  },
  '/governance/contested': () => ({ path: '/contests' }),
  '/governance/contested/detail': (p) => {
    const label = contestLabel(p)
    const drop = ['contract', 'docType', 'indexName', 'indexValues']
    return label ? { path: `/contest/${seg(label)}`, drop } : { path: '/contests', drop }
  },
  '/governance/polls': (p) => {
    const range = POLL_WINDOWS[p.get('window') ?? '']
    const set: Record<string, string> = {}
    if (range) set.range = range
    return { path: '/polls', drop: ['window'], set }
  },
  '/groups': (p) =>
    p.get('contractId')
      ? { path: `/groups/${seg(p.get('contractId')!)}`, drop: ['contractId'] }
      : { path: '/contracts' },
  '/groups/detail': (p) => {
    const c = p.get('contractId')
    const pos = p.get('position')
    return c && pos
      ? { path: `/group/${seg(c)}/${seg(pos)}`, drop: ['contractId', 'position'] }
      : c
        ? { path: `/groups/${seg(c)}`, drop: ['contractId', 'position'] }
        : { path: '/contracts' }
  },
  '/epoch': () => ({ path: '/epochs' }),
  '/epoch/detail': (p) =>
    p.get('index')
      ? { path: `/epoch/${seg(p.get('index')!)}`, drop: ['index'] }
      : { path: '/epochs' },
  '/epoch/history': () => ({ path: '/epochs' }),
  '/evonode': (p) => {
    const id = p.get('proTxHash') ?? p.get('protx')
    return id
      ? { path: `/mn/${seg(id)}`, drop: ['proTxHash', 'protx'], set: { tab: 'platform' } }
      : { path: '/validators' }
  },
  '/network/status': () => ({ path: '/status' }),
  '/network/quorums': () => ({ path: '/quorums' }),
  '/network/protocol': () => ({ path: '/protocol' }),
  '/network/credits': () => ({ path: '/credits' }),
  '/network/shielded': () => ({ path: '/shielded' }),
  '/address': (p) =>
    p.get('addr')
      ? { path: `/platform-address/${seg(p.get('addr')!)}`, drop: ['addr'] }
      : { path: '/platform' },
  '/state-transition': (p) =>
    p.get('hash')
      ? { path: `/platform/tx/${seg(p.get('hash')!)}`, drop: ['hash'] }
      : { path: '/platform/txs' },
  '/tools': (p) => ({
    path: `/tools/${toolPath(p.get('tool'))}`,
    drop: ['tool'],
  }),
  '/destinations': () => ({ path: '/', drop: ['group'] }),
  '/broadcast': (p) => writePath(p),
  '/wallet': (p) => writePath(p),
  '/offline': () => ({ path: '/', drop: [] }),
  '/search': () => ({ path: '/search' }),
  '/saved': () => ({ path: '/saved' }),
  '/settings': () => ({ path: '/settings' }),
  '/about': () => ({ path: '/about' }),
  '/sdk-reference': () => ({ path: '/sdk-reference' }),
  '/query': () => ({ path: '/query' }),
}

export const NATIVE_PATHS: readonly string[] = Object.keys(NATIVE)

function writePath(p: URLSearchParams): Hit {
  const drop = [...p.keys()].filter((k) => k !== 'network' && k !== 'net')
  const identity = p.get('identity') ?? p.get('identityId')
  if (identity) return { path: `/identity/${seg(identity)}`, drop }
  const contract = p.get('contract') ?? p.get('contractId')
  if (contract) return { path: `/contract/${seg(contract)}`, drop }
  const token = p.get('token') ?? p.get('tokenId')
  if (token) return { path: `/token/${seg(token)}`, drop }
  return { path: '/about', drop }
}

const CHANGE_KINDS = ['joins', 'pose', 'address', 'keys']

function csvOf(p: URLSearchParams, key: string, map: (v: string) => string): string {
  const parts = (p.get(key) ?? '').split(',').map((v) => map(v.trim().toLowerCase()))
  return [...new Set(parts.filter(Boolean))].sort().join(',')
}

const asType = (v: string) => (v === 'evo' || v === 'regular' ? v : '')
const asReach = (v: string) => (v === 'reachable' || v === 'unreachable' ? v : '')
const asStatus = (v: string) =>
  v === 'enabled' ? v : v === 'pose-banned' || v === 'pose banned' ? 'pose-banned' : ''

function masternodeFilters(p: URLSearchParams, withSort: boolean): Hit {
  const set: Record<string, string> = {}
  const hosts = (p.get('host') ?? '').split(',')
  const asns = hosts.every((v) => /^\d+$/.test(v))
  const legacy = p.has('dir') || hosts.some((v) => /^AS\d+$/i.test(v))
  const drop = [
    'dir',
    ...(legacy || !asns ? ['host'] : []),
    ...(legacy ? ['version', 'dkg', 'page'] : []),
  ]
  const type = csvOf(p, 'type', asType)
  const status = csvOf(p, 'status', asStatus)
  // Before reachability and registration were separate, ?status= also carried Reachable/Unreachable.
  const reach = csvOf(p, 'reach', asReach) || asReach(lower(p.get('status')))
  for (const [k, v] of [
    ['type', type],
    ['status', status],
    ['reach', reach],
  ] as const) {
    if (v) set[k] = v
    else drop.push(k)
  }
  const sort = p.get('sort')
  if (!withSort) drop.push('sort')
  else if (sort && !sort.startsWith('-') && p.get('dir') === 'desc') set.sort = `-${sort}`
  return { path: '/masternodes', drop, set }
}

const lower = (v: string | null) => v?.trim().toLowerCase() ?? ''

function mapFilters(p: URLSearchParams): Hit {
  const hit = masternodeFilters(p, false)
  if (p.get('layer') !== 'nodes') hit.drop!.push('layer')
  return { ...hit, path: '/map' }
}

const LEGACY: [RegExp, (m: RegExpExecArray, p: URLSearchParams) => Hit][] = [
  [/^\/block-index\/(\d+)$/, (m) => ({ path: `/block/${m[1]}` })],
  [/^\/insight\/block-index\/(\d+)$/, (m) => ({ path: `/block/${m[1]}` })],
  [/^\/insight\/block\/([0-9a-fA-F]{64})$/, (m) => ({ path: `/block/${m[1]}` })],
  [/^\/insight\/tx\/([0-9a-fA-F]{64})$/, (m) => ({ path: `/tx/${m[1]}` })],
  [/^\/insight\/address\/([A-Za-z0-9]+)$/, (m) => ({ path: `/address/${m[1]}` })],
  [
    /^\/insight\/blocks$/,
    (_m, p) => {
      const date = p.get('blockDate')
      return date ? { path: '/blocks', drop: ['blockDate'], set: { date } } : { path: '/blocks' }
    },
  ],
  [/^\/insight\/status$/, () => ({ path: '/status' })],
  [/^\/insight\/messages\/verify$/, () => ({ path: '/tools/verify-message' })],
  [/^\/insight\/?$/, () => ({ path: '/' })],
  [/^\/masternodes(?:\.html)?$/, (_m, p) => masternodeFilters(p, true)],
  [/^\/map(?:\.html)?$/, (_m, p) => mapFilters(p)],
  [
    /^\/changes(?:\.html)?$/,
    (_m, p) => ({
      path: '/changes',
      drop: CHANGE_KINDS.includes(p.get('kind') ?? '') ? [] : ['kind'],
    }),
  ],
  [/^\/(v24|api)\.html$/, (m) => ({ path: `/${m[1]}` })],
  [/^\/tools\/fees$/, () => ({ path: '/mempool' })],
  [/^\/mn\.html$/, () => ({ path: '/masternodes' })],
  [/^\/platform\.html$/, () => ({ path: '/epochs' })],
  [/^\/index\.html$/, () => ({ path: '/' })],
]

export const LEGACY_PATTERNS: readonly RegExp[] = LEGACY.map(([re]) => re)

function trimSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

export interface Redirect {
  location: string
  permanent: boolean
}

export function redirectFor(url: URL, opts: RedirectOptions): Redirect | null {
  const path = trimSlash(url.pathname)
  const q = new URLSearchParams(url.search)
  const nativeHost = opts.nativeHosts.includes(url.hostname)

  const nativeHit = NATIVE[path]?.(q)
  const hit = nativeHit ?? matchLegacy(path, q)

  const legacyNet = q.has('net')
  const dropsMainnet = q.get('network') === 'mainnet'
  if (!hit && !legacyNet && !dropsMainnet) return null

  let network = q.get('network') ?? q.get('net')
  const target = new URLSearchParams(q)
  for (const k of hit?.drop ?? []) target.delete(k)
  for (const [k, v] of Object.entries(hit?.set ?? {})) target.set(k, v)
  target.delete('net')
  target.delete('network')
  const defaultedToTestnet = !network && !!nativeHit && nativeHost && nativeHit.path !== path
  if (defaultedToTestnet) network = 'testnet'
  if (network && network !== 'mainnet') target.set('network', network)

  const path2 = hit ? hit.path : url.pathname.replace(/^\/{2,}/, '/')
  const search = target.size ? `?${target.toString()}` : ''
  const same = path2 === url.pathname && canonical(target) === canonical(q)
  return same ? null : { location: `${path2}${search}`, permanent: !defaultedToTestnet }
}

const canonical = (p: URLSearchParams) =>
  [...p.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('&')

function matchLegacy(path: string, q: URLSearchParams): Hit | null {
  for (const [re, build] of LEGACY) {
    const m = re.exec(path)
    if (m) return build(m, q)
  }
  return null
}
