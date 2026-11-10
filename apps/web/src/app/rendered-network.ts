import { useLayoutEffect } from 'react'
import { setRenderedNetwork } from '@/data/active-network'
import { useNetwork } from '@/features/entity'

/** Tells cache-driven readers (source health, hydrated facts) which network the page on screen belongs to. */
export function useRenderedNetworkSync(): void {
  const net = useNetwork()
  useLayoutEffect(() => setRenderedNetwork(net), [net])
}
