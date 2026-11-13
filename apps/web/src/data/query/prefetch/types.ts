import type { NetworkId } from '@/lib/network'
import type { PrefetchItem } from '../loader'

/** What the root route's search adds to every route's search. */
export interface RouteSearch {
  network?: string | undefined
  net?: string | undefined
  sources?: string | undefined
}

export type NoParams = Record<never, never>

/** A route's prefetch: lists what its page reads, so the loader can start it before first paint (§6.3). */
export type Prefetch<P, S> = (net: NetworkId, params: P, search: S) => PrefetchItem[]
