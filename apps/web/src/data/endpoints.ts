import type { NetworkId } from '@/lib/network'

export type EndpointSource = 'quorums' | 'radar' | 'pe' | 'hyphen' | 'rate'

/** Base URL for a source on a network, or null where the source isn't offered. */
export function endpoint(net: NetworkId, source: EndpointSource): string | null {
  void net
  void source
  throw new Error('not implemented')
}

/** Port used for a quorum-list entry without `platformHTTPPort`; null on devnets (from config). */
export function dapiDefaultPort(net: NetworkId): number | null {
  void net
  throw new Error('not implemented')
}
