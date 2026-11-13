import type { NetworkId } from '@/lib/network'
import { sourceInUse } from '../endpoints'
import { healthQueries } from '../health-queries'
import { prefetchItem, type PrefetchItem } from './loader'

/** The freshness probes (§2.5) a network has, ready for `prefetchForRoute`. Imported by path, not through the barrel, so the clients stay out of it. */
export function healthProbeItems(net: NetworkId): PrefetchItem[] {
  const items: PrefetchItem[] = []
  if (sourceInUse(net, 'radar')) items.push(prefetchItem('http', healthQueries.radar(net)))
  if (sourceInUse(net, 'pe')) items.push(prefetchItem('http', healthQueries.pe(net)))
  if (sourceInUse(net, 'hyphen')) items.push(prefetchItem('http', healthQueries.hyphen(net)))
  return items
}
