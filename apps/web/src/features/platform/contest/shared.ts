import { useQueries, useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { useNavigate, type LinkProps } from '@tanstack/react-router'
import { useState } from 'react'
import type { Page } from '@/data/page'
import type { QueryKeyOf } from '@/data/query/keys'
import type { Sourced } from '@/data/envelope'
import type { VotePollsByEndDateDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { upcomingPollsArgs, type ContestKey } from '@/data/query/prefetch/p-vote'
import { useNetwork } from '@/features/entity'
import { useListMode, type DataTableProps, type LoadState } from '@/ui'

const pollKey = (contractId: string, type: string, index: string, values: readonly unknown[]) =>
  `${contractId}|${type}|${index}|${values.map(String).join('\u0000')}`

/** When each open contest ends, from the poll tree: Platform schedules every contest's end there. */
export function pollEnds(polls: readonly VotePollsByEndDateDto[]): Map<string, number> {
  const ends = new Map<string, number>()
  for (const bucket of polls) {
    for (const p of bucket.polls) {
      ends.set(
        pollKey(p.contractId, p.documentTypeName, p.indexName, p.indexValues),
        bucket.timestampMs,
      )
    }
  }
  return ends
}

export const endOf = (ends: Map<string, number>, ref: ContestKey) =>
  ends.get(pollKey(ref.contractId, ref.type, ref.index, ref.indexValues))

/** The next end dates, shared by the polls page and by every contest that needs its end time. */
export function useUpcomingPolls() {
  const net = useNetwork()
  return useQuery(sdkQueries['voting.votePollsByEndDate'](net, upcomingPollsArgs()))
}

const DEFAULT_LIMIT = 25

/** A link to the same page with `patch` applied to its search. */
export function searchLink(patch: Record<string, unknown>): LinkProps {
  return {
    to: '.',
    search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
  } as LinkProps
}

/** A link to page `n` of the same list; page 1 leaves `page` out of the search. */
export const pageLink = (n: number): LinkProps => searchLink({ page: n === 1 ? undefined : n })

/** Changes the page's search in place, back at page 1 unless `patch` says otherwise. */
export function useSetSearch() {
  const navigate = useNavigate()
  return (patch: Record<string, unknown>) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        page: undefined,
        ...patch,
      })) as never,
      replace: true,
      resetScroll: false,
    })
}

/**
 * How a PE list is shown, as the list mode says: pages, or one list that grows by a page at a time. The limit is the
 * search's unless it is the default, then the one the list remembers.
 */
function usePeListMode(listId: string, searchLimit: number) {
  const listMode = useListMode(listId)
  const [pagesShown, setPagesShown] = useState(1)
  const scroll = listMode.mode === 'scroll'
  return {
    scroll,
    limit: searchLimit !== DEFAULT_LIMIT ? searchLimit : listMode.limit,
    /** How many pages to ask for: one in page mode. */
    count: scroll ? pagesShown : 1,
    more: () => {
      setPagesShown((n) => n + 1)
    },
  }
}

/**
 * A Platform Explorer list as a table reads it: the page asked for, or in scroll mode every page so far. `queryFor`
 * builds the query for one page at the limit in force.
 */
export function usePeList<T>(
  listId: string,
  search: { page: number; limit: number },
  queryFor: (
    page: number,
    limit: number,
  ) => UseQueryOptions<Sourced<Page<T>>, Error, Sourced<Page<T>>, QueryKeyOf<'pe'>>,
) {
  const mode = usePeListMode(listId, search.limit)
  const queries = useQueries({
    queries: Array.from({ length: mode.count }, (_, i) =>
      queryFor(mode.scroll ? i + 1 : search.page, mode.limit),
    ),
  })
  const pages = queries.map((q) => q.data).filter((p) => p !== undefined)
  const rows = pages.flatMap((p) => p.data.items)
  const total = pages[0]?.data.total
  const first = queries[0]
  const last = queries[queries.length - 1]
  const paging: DataTableProps<T>['paging'] = mode.scroll
    ? {
        kind: 'infinite',
        hasNext: (last?.data?.data.items.length ?? 0) >= mode.limit,
        fetchNext: mode.more,
        fetching: last?.isFetching === true && last.data === undefined,
      }
    : { kind: 'page', page: search.page, limit: mode.limit, total, to: pageLink }
  const state: LoadState = first?.isPending
    ? 'loading'
    : first?.isError && !first.data
      ? 'error'
      : 'ready'
  return {
    pages,
    rows,
    total,
    paging,
    state,
    error: first?.error,
    onRetry: () => void first?.refetch(),
  }
}
