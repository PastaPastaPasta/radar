import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { dapiKeys, hyKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'

/**
 * Reads the Core figures that change with every block again each time the tip height rises. No stream pushes
 * difficulty, supply or size, so a page left open would keep showing the block it opened on.
 */
export function useRefetchOnNewBlock(net: NetworkId, height: number | undefined): void {
  const queryClient = useQueryClient()
  const last = useRef<number | undefined>(undefined)

  useEffect(() => {
    const previous = last.current
    last.current = height
    if (height === undefined || previous === undefined || height <= previous) return
    for (const queryKey of [dapiKeys(net, 'status'), hyKeys(net, 'metrics-latest')]) {
      void queryClient.invalidateQueries({ queryKey, exact: true })
    }
  }, [net, height, queryClient])
}
