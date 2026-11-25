import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query'
import { useNavigate, type LinkProps } from '@tanstack/react-router'
import type { Page } from '@/data/page'
import type { Sourced } from '@/data/envelope'
import type { VotePollsByEndDateDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { upcomingPollsArgs, type ContestKey } from '@/data/query/prefetch/p-vote'
import { useNetwork } from '@/features/entity'
import { usePeScroll } from '../pe-scroll'

/** Rows per page of the lists Platform reads by cursor: each page asks for one more, to know whether another follows. */
export const CURSOR_PAGE = 25

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
 * A Platform Explorer list as a table reads it: page after page as the reader scrolls, from the page the address names.
 * `queryFor` builds the query for one page; `listKey` names everything else the list is read with.
 */
export function usePeList<T, K extends QueryKey>(
  listKey: string,
  search: { page: number; limit: number },
  queryFor: (
    page: number,
    limit: number,
  ) => UseQueryOptions<Sourced<Page<T>>, Error, Sourced<Page<T>>, K>,
  getRowId: (row: T) => string,
) {
  return usePeScroll({
    listKey,
    start: search.page,
    limit: search.limit,
    page: (page) => queryFor(page, search.limit),
    getRowId,
  })
}
