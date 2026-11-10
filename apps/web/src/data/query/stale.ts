export type DataClass =
  'immutable' | 'structural' | 'live' | 'tip' | 'crawl' | 'index' | 'latest' | 'rate'

/** Narrower than the committed `Pick<QueryObserverOptions, …>`, so it spreads into any `queryOptions` call. */
export interface ClassOptions {
  staleTime: number
  gcTime: number
  meta?: { persist: true }
  refetchInterval?: number
  refetchOnWindowFocus?: boolean
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const persist = { persist: true } as const

const CLASSES: Record<DataClass, ClassOptions> = {
  immutable: { staleTime: Infinity, gcTime: 24 * HOUR, meta: persist },
  structural: { staleTime: 5 * MINUTE, gcTime: HOUR, meta: persist },
  live: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE, refetchOnWindowFocus: true },
  tip: { staleTime: Infinity, gcTime: 10 * MINUTE },
  crawl: { staleTime: 5 * MINUTE, gcTime: 30 * MINUTE },
  index: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE, refetchOnWindowFocus: true },
  latest: { staleTime: 10 * SECOND, gcTime: 5 * MINUTE },
  rate: { staleTime: MINUTE, gcTime: 30 * MINUTE, refetchInterval: MINUTE },
}

/** Classes whose queries refetch when the window regains focus. */
export const REFETCH_ON_FOCUS: ReadonlySet<DataClass> = new Set(
  (Object.keys(CLASSES) as DataClass[]).filter((c) => CLASSES[c].refetchOnWindowFocus),
)

export function dataClass(c: DataClass): ClassOptions {
  const o = CLASSES[c]
  return { ...o, meta: o.meta && { ...o.meta } }
}

/** Polling interval for the classes that poll only some of their queries (§5.2). */
export const POLL_MS = {
  radarStatus: MINUTE,
  radarActivation: MINUTE,
  peLatest: 10 * SECOND,
  mempool: 15 * SECOND,
  rate: MINUTE,
} as const
