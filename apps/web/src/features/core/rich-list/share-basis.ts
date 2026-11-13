import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import { useIndexHealth } from '@/data/index-health'
import type { NetworkId } from '@/lib/network'

/**
 * The total each share on the page is of: the circulating supply the Charts page shows, or, when that isn't available,
 * the positive address balances the list itself was ranked against, named as such.
 */
export type ShareBasis =
  | { kind: 'loading' }
  | { kind: 'circulating'; total: bigint; stamp: SourceStamp }
  | { kind: 'balances'; total: bigint | undefined }

export function useShareBasis(net: NetworkId, balancesTotal: bigint | undefined): ShareBasis {
  const metrics = useQuery(hyQueries.metricsLatest(net))
  const index = useIndexHealth(net)
  if (index.state !== 'stale' && metrics.data) {
    return {
      kind: 'circulating',
      total: metrics.data.data.circulatingSupply,
      stamp: stampOf(metrics.data),
    }
  }
  if (metrics.isPending && index.state !== 'stale') return { kind: 'loading' }
  return { kind: 'balances', total: balancesTotal }
}
