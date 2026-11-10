import { useQuery } from '@tanstack/react-query'
import { healthQueries } from '@/data/health-queries'
import { useSourceHealth } from '@/data/health'
import { isDevnet, type NetworkId } from '@/lib/network'

/**
 * True once Hyphen's freshness probe has answered and the index is neither stale nor down (§4.7 rule 3).
 * Pages that add Hyphen-only facts to a DAPI page (chainwork, spent flags) wait for this before asking.
 */
export function useHyphenFit(net: NetworkId): boolean {
  const probe = useQuery({ ...healthQueries.hyphen(net), enabled: !isDevnet(net) })
  const health = useSourceHealth('hyphen')
  return probe.isSuccess && health.state !== 'stale' && health.state !== 'down'
}
