export type DataClass =
  'immutable' | 'structural' | 'live' | 'tip' | 'crawl' | 'index' | 'latest' | 'rate'

/** Narrower than the committed `Pick<QueryObserverOptions, …>`, so it spreads into any `queryOptions` call. */
export interface ClassOptions {
  staleTime: number
  gcTime: number
  /** `persist` marks the classes the IndexedDB persister keeps; `dataClass` lets the query client stamp the class onto answers. */
  meta: { persist?: true; dataClass: DataClass }
  refetchInterval?: number
  refetchOnWindowFocus?: boolean
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const CLASSES: Record<DataClass, Omit<ClassOptions, 'meta'>> = {
  immutable: { staleTime: Infinity, gcTime: 24 * HOUR },
  structural: { staleTime: 5 * MINUTE, gcTime: HOUR },
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

const PERSISTED: ReadonlySet<DataClass> = new Set(['immutable', 'structural'])

export function dataClass(c: DataClass): ClassOptions {
  return {
    ...CLASSES[c],
    meta: { ...(PERSISTED.has(c) && { persist: true as const }), dataClass: c },
  }
}

const STALE_AGE_FACTOR = 4

/** Tip data is pushed, so its staleTime is infinite; the age that matters is the header-stream silence in §2.5. */
const TIP_STALE_AGE_MS = 20 * MINUTE

/** The age at which a figure of this class is shown as stale: staleTime × 4 (§7.3). */
export function staleAfterMs(c: DataClass): number {
  if (c === 'tip') return TIP_STALE_AGE_MS
  return CLASSES[c].staleTime * STALE_AGE_FACTOR
}

/** Polling interval for the classes that poll only some of their queries (§5.2). */
export const POLL_MS = {
  radarStatus: MINUTE,
  radarActivation: MINUTE,
  peLatest: 10 * SECOND,
  mempool: 15 * SECOND,
  rate: MINUTE,
} as const
