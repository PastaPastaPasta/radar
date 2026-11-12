export type FixtureSource = 'radar' | 'pe' | 'hyphen' | 'insight'

export interface FixtureLocation {
  source: FixtureSource
  net: string
  /** Path below the source's base, with the query normalised (sorted). */
  path: string
  slug: string
}

const HYPHEN_PATH = /^\/x\/hy\/(mainnet|testnet)(\/.*)?$/
const RADAR_PATH = /^\/api\/v1(?:\/(mainnet|testnet))?(\/.*)?$/

const PE_HOSTS: Record<string, string> = {
  'api.pe.dashhq.org': 'mainnet',
  'api.testnet.pe.dashhq.org': 'testnet',
}

const INSIGHT_HOSTS: Record<string, string> = {
  'insight.dash.org': 'mainnet',
  'insight.testnet.networks.dash.org': 'testnet',
}
const INSIGHT_PATH = /^\/insight-api(\/.*)$/

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function normalizedQuery(search: URLSearchParams): string {
  const pairs = [...search.entries()].sort(([ak, av], [bk, bv]) =>
    ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1,
  )
  return pairs.map(([k, v]) => `${k}=${v}`).join('&')
}

function safe(s: string): string {
  return s.replace(/[^A-Za-z0-9._,=-]+/g, '_')
}

const HEX64 = /[0-9a-fA-F]{64}/g

export function slugOf(path: string, query: string, method = 'GET'): string {
  const base = (path.replace(/^\/+|\/+$/g, '') || 'root').replace(HEX64, (h) => h.toLowerCase())
  let slug = safe(base.replaceAll('/', '__'))
  if (query) slug += '--' + safe(query.replaceAll('=', '-').replaceAll('&', ','))
  if (method !== 'GET') slug = `${method.toLowerCase()}--${slug}`
  if (slug.length > 120) slug = `${slug.slice(0, 100)}-${fnv1a(`${method} ${path}?${query}`)}`
  return slug
}

/** Where a request URL lives in the recorded fixtures, or null if no fixtured source serves it. */
export function locateFixture(url: string, method = 'GET'): FixtureLocation | null {
  const u = new URL(url, 'http://localhost')
  const query = normalizedQuery(u.searchParams)

  const hy = HYPHEN_PATH.exec(u.pathname)
  if (hy) {
    const path = hy[2] ?? '/'
    return { source: 'hyphen', net: hy[1]!, path, slug: slugOf(path, query, method) }
  }
  if (u.hostname === 'radar.dashhq.org') {
    const m = RADAR_PATH.exec(u.pathname)
    if (!m) return null
    const path = m[2] ?? '/'
    return { source: 'radar', net: m[1] ?? 'global', path, slug: slugOf(path, query, method) }
  }
  const peNet = PE_HOSTS[u.hostname]
  if (peNet) {
    return { source: 'pe', net: peNet, path: u.pathname, slug: slugOf(u.pathname, query, method) }
  }
  const insightNet = INSIGHT_HOSTS[u.hostname]
  if (insightNet) {
    const path = INSIGHT_PATH.exec(u.pathname)?.[1]
    if (!path) return null
    return { source: 'insight', net: insightNet, path, slug: slugOf(path, query, method) }
  }
  return null
}
