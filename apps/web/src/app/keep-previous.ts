import type { NetworkId } from '@/lib/network'

/**
 * `placeholderData` that keeps the last rows on screen while the next page loads, but never another
 * network's: the route doesn't remount when the network changes, so the observer would otherwise hand
 * back the old network's rows under the new network's header.
 */
export function keepPreviousOnNetwork(net: NetworkId) {
  return <T>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }) =>
    previousQuery?.queryKey[0] === net ? previous : undefined
}
