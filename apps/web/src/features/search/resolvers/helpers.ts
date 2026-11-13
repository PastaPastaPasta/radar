import { QueryClient, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import type { SourceStamp } from '@/data/envelope'

/** Resolvers run outside React, so a query factory's options are run on a client that keeps nothing. */
const lookupClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })

/** Runs a `queries.ts` factory's query once and stops it when the resolver's `signal` aborts. */
export function fetchLookup<T, K extends QueryKey>(
  options: UseQueryOptions<T, Error, T, K>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.addEventListener(
    'abort',
    () => void lookupClient.cancelQueries({ queryKey: options.queryKey, exact: true }),
    { once: true },
  )
  return lookupClient.fetchQuery({
    queryKey: options.queryKey,
    queryFn: options.queryFn,
  })
}

export function localStamp(): SourceStamp {
  const now = Date.now()
  return { source: 'local', asOf: now, fetchedAt: now, proved: false }
}

/** `0123abcd…cdef12`: enough of an id to tell two apart. */
export function shortId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}

/** DPNS keeps a label in its homograph-safe form (o→0, i and l→1) next to the label as written. */
export function homographSafe(label: string): string {
  return label.toLowerCase().replace(/o/g, '0').replace(/[il]/g, '1')
}

export const dpnsLabel = (name: string): string => name.replace(/\.dash$/i, '').toLowerCase()

/**
 * Digits alone are read as a number first (a height, an epoch), and a date as a date. A name or text lookup for
 * either would only ask for every prefix of what is being typed, so those lookups leave it to the number and date
 * resolvers.
 */
export function isNumeric(c: { classes: string[]; normalized: string }): boolean {
  return c.classes.includes('date') || /^\d+$/.test(c.normalized)
}
