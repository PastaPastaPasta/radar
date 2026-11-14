import { useInfiniteQuery, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { HyAddressTx, HyPage } from '@/data/hyphen/schemas'
import { useIndexHealth } from '@/data/index-health'
import type { NetworkId } from '@/lib/network'
import {
  addressQueries,
  insightAddressQueries,
  type IndexedPending,
  type IndexSource,
} from './queries'

const NO_PENDING: IndexedPending[] = []

interface OldestPage {
  rows: HyAddressTx[]
  pagesTotal: number
}

/** When an address was first and last seen, worked out from Insight's history pages. */
interface InsightSeen {
  first?: number
  last?: number
  /** Where each time came from: the newest transactions and the oldest page are separate requests. */
  firstStamp?: SourceStamp
  lastStamp?: SourceStamp
  /** The oldest page moved while it was being read, so `first` may be a later transaction than the oldest. */
  firstApproximate: boolean
  /** The history is still being read. */
  loading: boolean
  /** The oldest page could not be read, so the first time is unknown. */
  failed: boolean
  /** The history itself could not be read, so nothing is known of when the address was seen. */
  historyFailed: boolean
  retry: () => void
}

/**
 * What the address page reads: Hyphen's index, or Insight's while Hyphen's is stale (§4.7). Neither is asked
 * until the index health is known, so a stale network never starts a read it would throw away.
 */
export function useAddressData(net: NetworkId, address: string) {
  const index = useIndexHealth(net)
  const insight = index.readFrom === 'insight'
  const hyphen = !insight && !index.pending
  const hy = {
    summary: useQuery({ ...addressQueries.summary(net, address), enabled: hyphen }),
    txs: useInfiniteQuery({ ...addressQueries.txs(net, address), enabled: hyphen }),
    utxos: useQuery({ ...addressQueries.utxos(net, address), enabled: hyphen }),
  }
  const ins = {
    summary: useQuery({ ...insightAddressQueries.summary(net, address), enabled: insight }),
    txs: useInfiniteQuery({ ...insightAddressQueries.txs(net, address), enabled: insight }),
    utxos: useQuery({ ...insightAddressQueries.utxos(net, address), enabled: insight }),
  }
  const from: IndexSource = insight ? 'insight' : 'hyphen'
  const pagesTotal = ins.txs.data?.pagesTotal
  const wholeHistoryLoaded = isWholeHistory(ins.txs.data)
  const oldest = useQuery({
    ...insightAddressQueries.oldestPage(net, address, pagesTotal ?? 1),
    enabled: insight && pagesTotal !== undefined && pagesTotal > 1 && !wholeHistoryLoaded,
  })
  // A transaction that arrives between the first page and the last moves the oldest one onto a page further on, so the
  // last page is read again at the count it reported.
  const movedTo = oldest.data?.data.pagesTotal
  const oldestAgain = useQuery({
    ...insightAddressQueries.oldestPage(net, address, movedTo ?? 1),
    enabled: insight && !wholeHistoryLoaded && movedPast(pagesTotal, movedTo),
  })

  // Insight's pages count the mempool, so a first page can hold only unconfirmed transactions while history follows.
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = ins.txs
  const confirmed = data?.pages.reduce((n, p) => n + p.data.items.length, 0) ?? 0
  useEffect(() => {
    if (
      insight &&
      data &&
      confirmed === 0 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    ) {
      void fetchNextPage()
    }
  }, [
    insight,
    data,
    confirmed,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ])

  const seen = insight
    ? insightSeen(
        ins.txs,
        { first: oldest, again: oldestAgain, asked: pagesTotal },
        wholeHistoryLoaded,
      )
    : undefined

  return {
    index,
    from,
    seen,
    pendingInIndex: insight ? (data?.pending ?? NO_PENDING) : NO_PENDING,
    ...(insight ? ins : hy),
  }
}

/** The history's page count changed to a real multi-page count since it was asked for. */
function movedPast(asked: number | undefined, reported: number | undefined): boolean {
  return reported !== undefined && reported !== asked && reported > 1
}

function isWholeHistory(loaded: { pages: unknown[]; pagesTotal?: number } | undefined): boolean {
  return loaded?.pagesTotal !== undefined && loaded.pages.length >= loaded.pagesTotal
}

function insightSeen(
  history: {
    data?: { pages: Sourced<HyPage<HyAddressTx>>[]; pagesTotal?: number }
    isPending: boolean
    isError: boolean
    isFetchNextPageError: boolean
    hasNextPage: boolean
    refetch: () => unknown
    fetchNextPage: () => unknown
  },
  oldest: {
    first: UseQueryResult<Sourced<OldestPage>>
    again: UseQueryResult<Sourced<OldestPage>>
    asked: number | undefined
  },
  whole: boolean,
): InsightSeen {
  const loaded = history.data
  const rows = loaded?.pages.flatMap((p) => p.data.items) ?? []
  const times = (list: HyAddressTx[]) => list.map((r) => r.blockTime)
  const lastSource = loaded?.pages.find((p) => p.data.items.length > 0)
  const last = rows.length > 0 ? Math.max(...times(rows)) : undefined
  const historyFailed = rows.length === 0 && (history.isError || history.isFetchNextPageError)
  const reported = oldest.first.data?.data.pagesTotal
  const reread = movedPast(oldest.asked, reported)
  const read = reread ? oldest.again : oldest.first
  const firstSource: Sourced<unknown> | undefined = whole ? loaded?.pages.at(-1) : read.data
  const list = whole ? rows : (read.data?.data.rows ?? [])
  // Even after the second read the count can have moved again; the date is then no better than a neighbour's.
  const approximate =
    !whole && reread && read.data !== undefined && read.data.data.pagesTotal !== reported
  return {
    first: list.length > 0 ? Math.min(...times(list)) : undefined,
    last,
    firstStamp: firstSource ? stampOf(firstSource) : undefined,
    lastStamp: lastSource ? stampOf(lastSource) : undefined,
    firstApproximate: approximate,
    loading:
      !historyFailed &&
      (history.isPending ||
        (rows.length === 0 && history.hasNextPage) ||
        (!whole && (oldest.first.isPending || read.isPending))),
    failed: !whole && (oldest.first.isError || (reread && oldest.again.isError)),
    historyFailed,
    retry: () => {
      if (history.isError) void history.refetch()
      else void history.fetchNextPage()
    },
  }
}
