export interface RedirectOptions {
  nativeHosts: readonly string[]
}

interface Hit {
  path: string
  drop?: readonly string[]
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
}

function contestLabel(raw: string | null): string | null {
  if (!raw) return null
  try {
    const values: unknown = JSON.parse(raw)
    const label = Array.isArray(values) ? (values as unknown[])[1] : undefined
    return typeof label === 'string' && label ? label : null
  } catch {
    return null
  }
}

const NATIVE: Record<string, Rule> = {
  '/identity': (p) =>
    p.get('id')
      ? { path: `/identity/${seg(p.get('id')!)}`, drop: ['id'] }
      : { path: '/identities' },
  '/identity/lookup': () => ({ path: '/identity/lookup' }),
  '/contract': (p) =>
    p.get('id') ? { path: `/contract/${seg(p.get('id')!)}`, drop: ['id'] } : { path: '/contracts' },
  '/contract/documents': (p) =>
    p.get('id') && p.get('type')
      ? {
          path: `/contract/${seg(p.get('id')!)}/documents/${seg(p.get('type')!)}`,
          drop: ['id', 'type'],
        }
      : { path: '/contracts' },
  '/contract/document': (p) =>
    p.get('id') && p.get('type') && p.get('docId')
      ? {
          path: `/document/${seg(p.get('id')!)}/${seg(p.get('type')!)}/${seg(p.get('docId')!)}`,
          drop: ['id', 'type', 'docId'],
        }
      : { path: '/contracts' },
  '/contract/token': (p) =>
    p.get('id')
      ? { path: `/contract/${seg(p.get('id')!)}`, drop: ['id', 'position'] }
      : { path: '/tokens' },
  '/token': (p) =>
    p.get('id') ? { path: `/token/${seg(p.get('id')!)}`, drop: ['id'] } : { path: '/tokens' },
  '/token/holders': (p) =>
    p.get('id')
      ? { path: `/token/${seg(p.get('id')!)}/holders`, drop: ['id'] }
      : { path: '/tokens' },
  '/dpns': (p) =>
    p.get('name')
      ? { path: `/name/${seg(p.get('name')!.replace(/\.dash$/i, ''))}`, drop: ['name'] }
      : { path: '/names' },
  '/dpns/search': () => ({ path: '/names' }),
  '/governance/contested': () => ({ path: '/contests' }),
  '/governance/contested/detail': (p) => {
    const label = contestLabel(p.get('indexValues'))
    const drop = ['contract', 'docType', 'indexName', 'indexValues']
    return label ? { path: `/contest/${seg(label)}`, drop } : { path: '/contests', drop }
  },
  '/governance/polls': () => ({ path: '/polls' }),
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
    return id ? { path: `/mn/${seg(id)}`, drop: ['proTxHash', 'protx'] } : { path: '/validators' }
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
    path: `/tools/${TOOLS[p.get('tool') ?? ''] ?? 'transition'}`,
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
  [/^\/(masternodes|map|v24|changes|api)\.html$/, (m) => ({ path: `/${m[1]}` })],
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
