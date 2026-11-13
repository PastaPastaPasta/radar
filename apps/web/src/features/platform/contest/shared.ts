import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Sourced } from '@/data/envelope'
import type { VotePollsByEndDateDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { upcomingPollsArgs, type ContestRef } from '@/data/query/prefetch/p-vote'
import { useNetwork } from '@/features/entity'
import { useListMode, type LoadState } from '@/ui'

export function loadState(query: { isPending: boolean; isError: boolean }): LoadState {
  return query.isPending ? 'loading' : query.isError ? 'error' : 'ready'
}

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

export const endOf = (ends: Map<string, number>, ref: Omit<ContestRef, 'label' | 'isDpns'>) =>
  ends.get(pollKey(ref.contractId, ref.type, ref.index, ref.indexValues))

/** The next end dates, shared by the polls page and by every contest that needs its end time. */
export function useUpcomingPolls() {
  const net = useNetwork()
  return useQuery(sdkQueries['voting.votePollsByEndDate'](net, upcomingPollsArgs()))
}

export type UpcomingPolls = Sourced<VotePollsByEndDateDto[]>

export const DEFAULT_LIMIT = 25

/**
 * How a PE list is shown, as the list mode says: pages, or one list that grows by a page at a time. The limit is the
 * search's unless it is the default, then the one the list remembers.
 */
export function usePeListMode(listId: string, searchLimit: number) {
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
