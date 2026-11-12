import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import type { LoadState } from '@/ui'
import { stampOf, type Sourced, type SourceStamp } from '@/data/envelope'

type ListPage = Sourced<{ items: readonly unknown[] }>

type PageItems<P> = P extends Sourced<{ items: readonly (infer T)[] }> ? T : never

/**
 * The props every cursor-paged `DataTable` takes from its infinite query: the flattened rows, a state
 * that keeps already-loaded rows on screen when a later page fails, retry, and "Show more" paging. A list with
 * no rows yet but more pages to read is loading, not empty.
 */
export function infiniteTableProps<P extends ListPage>(
  query: UseInfiniteQueryResult<InfiniteData<P>>,
) {
  const rows: PageItems<P>[] =
    query.data?.pages.flatMap((p) => p.data.items as PageItems<P>[]) ?? []
  const state = query.isPending
    ? ('loading' as const)
    : query.isError && rows.length === 0
      ? ('error' as const)
      : rows.length === 0
        ? query.hasNextPage
          ? ('loading' as const)
          : ('empty' as const)
        : ('ready' as const)
  return {
    rows,
    state,
    error: query.error,
    onRetry: () => void query.refetch(),
    paging: {
      kind: 'infinite' as const,
      hasNext: query.hasNextPage,
      fetchNext: () => void query.fetchNextPage(),
      fetching: query.isFetchingNextPage,
    },
  }
}

/** The source stamp of an infinite list's first page, or undefined before it has loaded. */
export function firstPageStamp(
  query: UseInfiniteQueryResult<InfiniteData<ListPage>>,
): SourceStamp | undefined {
  const first = query.data?.pages[0]
  return first ? stampOf(first) : undefined
}

/** A card's load state for a plain query. */
export function cardState(query: { isPending: boolean; isError: boolean }): LoadState {
  return query.isPending ? 'loading' : query.isError ? 'error' : 'ready'
}
