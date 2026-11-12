import type { NetworkId } from '@/lib/network'

/** Hyphen's index is stale once it is more than this many blocks below DAPI's best height. */
export const INDEX_STALE_BLOCKS = 6
/** It is fresh again at this many behind or fewer; in between, the earlier answer stands so pages don't flip. */
export const INDEX_FRESH_BLOCKS = 2

export type IndexState = 'fresh' | 'stale'

export function nextIndexState(previous: IndexState | undefined, behind: number): IndexState {
  if (behind > INDEX_STALE_BLOCKS) return 'stale'
  if (behind <= INDEX_FRESH_BLOCKS) return 'fresh'
  return previous ?? 'fresh'
}

const remembered = new Map<NetworkId, IndexState>()

export function settleIndexState(net: NetworkId, behind: number): IndexState {
  const state = nextIndexState(remembered.get(net), behind)
  remembered.set(net, state)
  return state
}

export function resetIndexState(): void {
  remembered.clear()
}

/** The last answer for a network, so a route loader can pick the index to prefetch before the probe has run. */
export const rememberedIndexState = (net: NetworkId): IndexState | undefined => remembered.get(net)
