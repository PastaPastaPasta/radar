import { parseNetworkParam, type NetworkId } from '@/lib/network'

/**
 * Two readings of "the network". The active one follows the route being loaded, so loaders and
 * clients hit the right backend as soon as a navigation starts. The rendered one follows the page
 * on screen and only changes when the navigation commits: anything drawn from the cache (source
 * health, hydrated facts) reads it, so the old page never shows the new network's state while it
 * waits for its replacement.
 */
interface NetworkStore {
  get(): NetworkId | undefined
  set(net: NetworkId): void
  subscribe(cb: () => void): () => void
}

function networkStore(): NetworkStore {
  const listeners = new Set<() => void>()
  let current: NetworkId | undefined
  return {
    get: () => current,
    set(net) {
      if (current === net) return
      current = net
      for (const cb of [...listeners]) cb()
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

function fromLocation(): NetworkId {
  if (typeof location === 'undefined') return 'mainnet'
  const params = new URLSearchParams(location.search)
  return parseNetworkParam(params.get('network') ?? undefined, params.get('net') ?? undefined).net
}

const active = networkStore()
const rendered = networkStore()

export function getActiveNetwork(): NetworkId {
  let net = active.get()
  if (!net) {
    net = fromLocation()
    active.set(net)
  }
  return net
}

export const setActiveNetwork = (net: NetworkId): void => active.set(net)

export const getRenderedNetwork = (): NetworkId => rendered.get() ?? getActiveNetwork()
export const setRenderedNetwork = (net: NetworkId): void => rendered.set(net)

export function subscribeRenderedNetwork(cb: () => void): () => void {
  const offRendered = rendered.subscribe(cb)
  const offActive = active.subscribe(cb)
  return () => {
    offRendered()
    offActive()
  }
}
