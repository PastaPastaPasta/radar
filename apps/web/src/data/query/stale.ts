import type { QueryObserverOptions } from '@tanstack/query-core'

export type DataClass =
  'immutable' | 'structural' | 'live' | 'tip' | 'crawl' | 'index' | 'latest' | 'rate'

export function dataClass(
  c: DataClass,
): Pick<QueryObserverOptions, 'staleTime' | 'gcTime' | 'meta' | 'refetchInterval'> {
  void c
  throw new Error('not implemented')
}
