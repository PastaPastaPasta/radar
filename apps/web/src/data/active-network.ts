import { parseNetworkParam, type NetworkId } from '@/lib/network'

const listeners = new Set<() => void>()
let current: NetworkId | undefined

function fromLocation(): NetworkId {
  if (typeof location === 'undefined') return 'mainnet'
  const params = new URLSearchParams(location.search)
  return parseNetworkParam(params.get('network') ?? undefined, params.get('net') ?? undefined).net
}

export function getActiveNetwork(): NetworkId {
  current ??= fromLocation()
  return current
}

export function setActiveNetwork(net: NetworkId): void {
  if (current === net) return
  current = net
  for (const cb of [...listeners]) cb()
}

export function subscribeActiveNetwork(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
