import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { coreQueries } from './queries'
import type { NetworkId } from '@/lib/network'

/**
 * The live Core tip height, from the query the shell keeps current. A detail page shows its
 * confirmations from it, and refetches itself on each new block while `settled` is false.
 */
export function useFollowTip(
  net: NetworkId,
  { key, settled, enabled = true }: { key: QueryKey; settled: boolean; enabled?: boolean },
): number | undefined {
  const queryClient = useQueryClient()
  const tip = useQuery({ ...coreQueries.tip(net), enabled })
  const height = tip.data?.data.height
  const last = useRef<number | undefined>(undefined)

  useEffect(() => {
    const previous = last.current
    last.current = height
    if (settled || height === undefined || previous === undefined || height === previous) return
    void queryClient.invalidateQueries({ queryKey: key, exact: true })
  }, [height, settled, key, queryClient])

  return height
}
