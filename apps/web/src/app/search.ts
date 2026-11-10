import { retainSearchParams, type SearchMiddleware } from '@tanstack/react-router'
import { z } from 'zod'
import { setActiveNetwork } from '@/data/active-network'
import { parseNetworkParam } from '@/lib/network'

export const parseSearch = (s: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(s))

function encode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%2C/gi, ',')
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/')
    .replace(/%40/g, '@')
}

function scalar(value: unknown): string | undefined {
  if (value === undefined || value === null || value === false || value === '') return undefined
  if (value === true) return '1'
  if (Array.isArray(value)) {
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

const csvInput = z.preprocess((v) => (Array.isArray(v) ? v.map(String).join(',') : v), z.string())

export const zCsv = csvInput.transform((s) => [...new Set(s.split(',').filter(Boolean))].sort())

export const zCsvEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  csvInput.transform((s) =>
    [...new Set(s.split(','))]
      .filter((v): v is T[number] => (values as readonly string[]).includes(v))
      .sort(),
  )

const NUMBER = /^-?\d+(?:\.\d+)?$/

export interface NumericRange {
  min?: number
  max?: number
}

const rangeObject = z.object({ min: z.number().optional(), max: z.number().optional() })

/** `min..max`, either side optional. Accepts its own output so a validated search can be validated again. */
export const zRange = z.union([
  rangeObject,
  z.string().transform((s, ctx): NumericRange => {
    const parts = s.split('..')
    const [lo, hi] = parts
    const ok =
      parts.length === 2 &&
      (lo === '' || NUMBER.test(lo ?? '')) &&
      (hi === '' || NUMBER.test(hi ?? '')) &&
      s !== '..'
    if (!ok) {
      ctx.issues.push({ code: 'custom', message: 'Not a range', input: s })
      return z.NEVER
    }
    return {
      ...(lo ? { min: Number(lo) } : {}),
      ...(hi ? { max: Number(hi) } : {}),
    }
  }),
])

export const zIsoDate = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
}, 'Not a date')

export const zPage = z.coerce.number().int().min(1)

export const LIMITS = [10, 25, 50, 100] as const
export const zLimit = z.coerce
  .number()
  .pipe(z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]))

export const zBool01 = z
  .union([z.literal('1'), z.literal(1), z.literal(true)])
  .transform(() => true)

export const rootSearch = z.object({
  network: z.string().optional().catch(undefined),
  net: z.string().optional().catch(undefined),
})

export type RootSearch = z.output<typeof rootSearch>

const canonicalize: SearchMiddleware<RootSearch> = ({ search, next }) => {
  const result = { ...next(search) }
  const { net } = parseNetworkParam(result.network ?? search.network, result.net ?? search.net)
  delete result.net
  if (net === 'mainnet') delete result.network
  else result.network = net
  return result
}

/** Keeps `network` on every link and rewrites the legacy `net`, an explicit mainnet or a bad value to the canonical form. */
export const networkMiddlewares: SearchMiddleware<RootSearch>[] = [
  canonicalize,
  retainSearchParams(['network']),
]

/** Tells the data layer which network the route names, before the route's loaders and queries run. */
export function activateNetwork(search: RootSearch): void {
  setActiveNetwork(parseNetworkParam(search.network, search.net).net)
}
