import type { NetworkId } from '@/lib/network'
import { hyphen } from './client'

/**
 * One-shot reads for search resolvers, which run outside React and have no query client. They go
 * through the same client, so the health registry and provenance stamps behave as everywhere else.
 */
export const hyLookups = {
  search: (net: NetworkId, q: string, signal?: AbortSignal) => hyphen.search(net, q, signal),
  address: (net: NetworkId, address: string, signal?: AbortSignal) =>
    hyphen.address(net, address, signal),
  proposal: (net: NetworkId, hash: string, signal?: AbortSignal) =>
    hyphen.proposal(net, hash, signal),
}
