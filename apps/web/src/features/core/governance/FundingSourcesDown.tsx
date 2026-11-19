import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { insQueries } from '@/data/insight/queries'
import type { NetworkId } from '@/lib/network'
import { ErrorState } from '@/ui'

/**
 * The two reads behind Passing and Funded that are not the proposal list: DAPI's masternode list (the exact funding
 * threshold) and Core's budget through Insight (Funded). When one fails the page says so, with a retry; the proposals
 * and the index's own passing flag stay.
 */
export function FundingSourcesDown({ net }: { net: NetworkId }) {
  const list = useQuery(coreQueries.masternodeList(net))
  const budget = useQuery(insQueries.superblockBudget(net))
  return (
    <>
      {list.isError && !list.data ? (
        <ErrorState
          error={list.error}
          source="dapi"
          compact
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}
      {budget.isError && !budget.data ? (
        <ErrorState
          error={budget.error}
          source="insight"
          compact
          onRetry={() => {
            void budget.refetch()
          }}
        />
      ) : null}
    </>
  )
}
