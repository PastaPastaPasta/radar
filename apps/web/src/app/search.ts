import { retainSearchParams, type SearchMiddleware } from '@tanstack/react-router'
import { z } from 'zod'
import { setActiveNetwork } from '@/data/active-network'
import { parseNetworkParam } from '@/lib/network'
import { encodeWhere, type NumericRange, type WhereClause } from '@/lib/search-schemas'
import { DECENTRALIZED_PARAM, setSourceModeFromLink } from '@/lib/source-mode'

export * from '@/lib/search-schemas'

export const parseSearch = (s: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(s))

function encode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%2C/gi, ',')
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/')
    .replace(/%40/g, '@')
}

const isWhereClause = (v: unknown): v is WhereClause =>
  typeof v === 'object' && v !== null && 'field' in v && 'op' in v && 'value' in v

function scalar(value: unknown): string | undefined {
  if (value === undefined || value === null || value === false || value === '') return undefined
  if (value === true) return '1'
  if (Array.isArray(value)) {
    if (value.every(isWhereClause) && value.length > 0) return encodeWhere(value)
    const parts = value.map(String).filter((v) => v !== '')
    return parts.length === 0 ? undefined : [...new Set(parts)].sort().join(',')
  }
  if (typeof value === 'object') {
    const { min, max } = value as NumericRange
    return `${min ?? ''}..${max ?? ''}`
  }
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : undefined
}

export const stringifySearch = (o: Record<string, unknown>): string => {
  const pairs = Object.keys(o)
    .sort()
    .flatMap((key) => {
      const value = scalar(o[key])
      if (value === undefined) return []
      if (key === 'network' && value === 'mainnet') return []
      return [`${encode(key)}=${encode(value)}`]
    })
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`
}

export const rootSearch = z.object({
  network: z.string().optional().catch(undefined),
  net: z.string().optional().catch(undefined),
  sources: z.string().optional().catch(undefined),
})

export type RootSearch = z.output<typeof rootSearch>

const canonicalize: SearchMiddleware<RootSearch> = ({ search, next }) => {
  const result = { ...next(search) }
  const { net } = parseNetworkParam(result.network ?? search.network, result.net ?? search.net)
  delete result.net
  if (net === 'mainnet') delete result.network
  else result.network = net
  if (result.sources !== DECENTRALIZED_PARAM) delete result.sources
  return result
}

/**
 * Keeps `network` and `sources` on every link, and rewrites the legacy `net`, an explicit mainnet or a bad value to the
 * canonical form.
 */
export const networkMiddlewares: SearchMiddleware<RootSearch>[] = [
  canonicalize,
  retainSearchParams(['network', 'sources']),
]

/** Tells the data layer which network the route names, before the route's loaders and queries run. */
export function activateNetwork(search: RootSearch): void {
  setActiveNetwork(parseNetworkParam(search.network, search.net).net)
}

/** Tells the data layer whether the address asks for Decentralized only mode, before anything is read for the route. */
export function activateSourceMode(search: RootSearch): void {
  setSourceModeFromLink(search.sources)
}
