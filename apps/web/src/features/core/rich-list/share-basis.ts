import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import { useIndexHealth } from '@/data/index-health'
import type { NetworkId } from '@/lib/network'

/**
 * The total each share on the page is of: the circulating supply the Charts page shows, or, when that isn't current
 * or isn't available, the positive address balances the list itself was ranked against, named as such.
 */
export type ShareBasis =
  | { kind: 'loading' }
  | { kind: 'circulating'; total: bigint; stamp: SourceStamp; height: number | undefined }
  | { kind: 'balances'; total: bigint | undefined; stale: boolean }

export function useShareBasis(net: NetworkId, balancesTotal: bigint | undefined): ShareBasis {
  const index = useIndexHealth(net)
  const stale = index.state === 'stale'
  const metrics = useQuery({ ...hyQueries.metricsLatest(net), enabled: !index.pending && !stale })
  if (index.pending) return { kind: 'loading' }
  if (!stale && metrics.data) {
    return {
      kind: 'circulating',
      total: metrics.data.data.circulatingSupply,
      stamp: stampOf(metrics.data),
      height: metrics.data.height,
    }
  }
  if (!stale && metrics.isPending) return { kind: 'loading' }
  return { kind: 'balances', total: balancesTotal, stale }
}
