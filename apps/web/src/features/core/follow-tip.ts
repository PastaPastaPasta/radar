import { useQuery, type QueryKey } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { useRefetchOnRise } from '@/features/entity'
import type { NetworkId } from '@/lib/network'

/**
 * The live Core tip height, from the query the shell keeps current. A detail page shows its confirmations from it,
 * and refetches itself on each new block while `settled` is false.
 */
export function useFollowTip(
  net: NetworkId,
  {
    keys,
    settled,
    enabled = true,
  }: { keys: readonly QueryKey[]; settled: boolean; enabled?: boolean },
): number | undefined {
  const tip = useQuery({ ...coreQueries.tip(net), enabled })
  const height = tip.data?.data.height
  useRefetchOnRise(net, height, { keys, settled })
  return height
}
