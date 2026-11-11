import type { NetworkId } from '@/lib/network'
import { radar } from './client'

/**
 * One-shot reads for search resolvers, which run outside React and have no query client. They go
 * through the same client, so the health registry and provenance stamps behave as everywhere else.
 */
export const radarLookups = {
  masternodes: (net: NetworkId, signal?: AbortSignal) => radar.masternodes(net, signal),
}
