import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { Page } from '@/data/page'
import type { PeQuery } from '@/data/pe/params'
import { viewKeys, type QueryKeyOf } from '@/data/query/keys'
import { keepPreviousOnNetwork } from '@/features/entity'
import type { NetworkId } from '@/lib/network'
import type { LoadState } from '@/ui'

/** A page of rows is read this many times at most when an address names a later page in infinite mode. */
export const MAX_CATCH_UP_PAGES = 20

export interface PagedListInput<Row> {
  net: NetworkId
  mode: 'pages' | 'scroll'
  page: number
  limit: number
  /** The filters the list is read with, in Platform Explorer's names. */
  query: PeQuery
  /** `pblock-list` or `ptx-list`: the cache name of an infinite list. */
  resource: string
  /** One page of the list as a cached query. */
  pageOptions: (
    page: number,
  ) => UseQueryOptions<Sourced<Page<Row>>, Error, Sourced<Page<Row>>, QueryKeyOf<'pe'>>
  enabled: boolean
  /** Called with the number of pages loaded after "Show more", so the address can follow. */
  onLoaded: (pages: number) => void
}

export interface PagedList<Row> {
  rows: Row[]
  state: LoadState
  error: unknown
  retry: () => void
  total: number | undefined
  /** The stamp of the first page. */
  source: SourceStamp | undefined
  paging:
    | { kind: 'infinite'; hasNext: boolean; fetchNext: () => void; fetching: boolean }
    | undefined
  fetching: boolean
}

const keyOf = (query: PeQuery) =>
  JSON.stringify(Object.entries(query).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

function stateOf(rows: number, pending: boolean, error: boolean, hasNext: boolean): LoadState {
  if (pending) return 'loading'
  if (error && rows === 0) return 'error'
  if (rows === 0) return hasNext ? 'loading' : 'empty'
  return 'ready'
}

/**
 * One list read page by page or, in infinite mode, appended page after page. Both read each page through the same
 * cached query, so switching mode refetches nothing it already holds.
 */
export function usePagedList<Row>(input: PagedListInput<Row>): PagedList<Row> {
  const { net, mode, page, limit, query, resource, pageOptions, enabled, onLoaded } = input
  const qc = useQueryClient()
  const single: UseQueryResult<Sourced<Page<Row>>> = useQuery({
    ...pageOptions(page),
    enabled: enabled && mode === 'pages',
    placeholderData: keepPreviousOnNetwork(net),
  })

  const infinite = useInfiniteQuery<Sourced<Page<Row>>, Error, InfiniteData<Sourced<Page<Row>>>>({
    queryKey: viewKeys(net, resource, { query: keyOf(query), limit }),
    initialPageParam: 1,
    queryFn: ({ pageParam }) => qc.fetchQuery(pageOptions(Number(pageParam)) as never),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.data.items.length, 0)
      const more =
        last.data.total === undefined
          ? last.data.items.length >= limit
          : loaded < last.data.total
      return more ? all.length + 1 : undefined
    },
    enabled: enabled && mode === 'scroll',
    placeholderData: keepPreviousOnNetwork(net),
  })

  const loadedPages = infinite.data?.pages.length ?? 0
  useEffect(() => {
    if (mode !== 'scroll' || infinite.isFetching || !infinite.hasNextPage) return
    if (loadedPages > 0 && loadedPages < Math.min(page, MAX_CATCH_UP_PAGES)) {
      void infinite.fetchNextPage()
    }
  }, [mode, page, loadedPages, infinite])

  return useMemo(() => {
    if (mode === 'pages') {
      const rows = single.data?.data.items ?? []
      return {
        rows,
        state: stateOf(rows.length, single.isPending, single.isError, false),
        error: single.error,
        retry: () => void single.refetch(),
        total: single.data?.data.total,
        source: single.data ? stampOf(single.data) : undefined,
        paging: undefined,
        fetching: single.isFetching,
      }
    }
    const pages = infinite.data?.pages ?? []
    const rows = pages.flatMap((p) => p.data.items)
    const first = pages[0]
    return {
      rows,
      state: stateOf(rows.length, infinite.isPending, infinite.isError, infinite.hasNextPage),
      error: infinite.error,
      retry: () => void infinite.refetch(),
      total: first?.data.total,
      source: first ? stampOf(first) : undefined,
      paging: {
        kind: 'infinite' as const,
        hasNext: infinite.hasNextPage,
        fetchNext: () => {
          onLoaded(pages.length + 1)
          void infinite.fetchNextPage()
        },
        fetching: infinite.isFetchingNextPage,
      },
      fetching: infinite.isFetching,
    }
  }, [mode, single, infinite, onLoaded])
}
