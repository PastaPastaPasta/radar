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

/** When an address was first and last seen, worked out from Insight's history pages. */
export interface InsightSeen {
  first?: number
  last?: number
  stamp?: SourceStamp
  /** The oldest page is still being read. */
  loading: boolean
  /** The oldest page could not be read, so the first time is unknown. */
  failed: boolean
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
  const wholeHistoryLoaded =
    pagesTotal !== undefined && (ins.txs.data?.pages.length ?? 0) >= pagesTotal
  const oldest = useQuery({
    ...insightAddressQueries.oldestPage(net, address, pagesTotal ?? 1),
    enabled: insight && pagesTotal !== undefined && pagesTotal > 1 && !wholeHistoryLoaded,
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

  const seen = insight ? insightSeen(ins.txs, oldest) : undefined

  return {
    index,
    from,
    seen,
    pendingInIndex: insight ? (data?.pending ?? NO_PENDING) : NO_PENDING,
    ...(insight ? ins : hy),
  }
}

function insightSeen(
  history: {
    data?: { pages: Sourced<HyPage<HyAddressTx>>[]; pagesTotal?: number }
    isPending: boolean
    hasNextPage: boolean
  },
  oldest: UseQueryResult<Sourced<HyAddressTx[]>>,
): InsightSeen {
  const loaded = history.data
  const rows = loaded?.pages.flatMap((p) => p.data.items) ?? []
  const times = (list: HyAddressTx[]) => list.map((r) => r.blockTime)
  const last = rows.length > 0 ? Math.max(...times(rows)) : undefined
  const whole = loaded?.pagesTotal !== undefined && loaded.pages.length >= loaded.pagesTotal
  const source: Sourced<unknown> | undefined = whole ? loaded?.pages.at(-1) : oldest.data
  const list = whole ? rows : (oldest.data?.data ?? [])
  return {
    first: list.length > 0 ? Math.min(...times(list)) : undefined,
    last,
    stamp: source ? stampOf(source) : undefined,
    loading:
      history.isPending ||
      (rows.length === 0 && history.hasNextPage) ||
      (!whole && oldest.isPending),
    failed: !whole && oldest.isError,
  }
}
