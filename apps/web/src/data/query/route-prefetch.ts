import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'
import { parseBlockRef } from '@/lib/core/block-ref'
import { coreQueries } from '../core/queries'
import { endpoint } from '../endpoints'
import { healthQueries } from '../health-queries'
import { peQueries } from '../pe/queries'
import { radarQueries } from '../radar/queries'
import { prefetchItem, type PrefetchItem } from './loader'

const TXID = /^[0-9a-f]{64}$/i

/** Core pages ask whether Hyphen is fit (§4.7) before every Hyphen request, so its probe is the one thing worth starting early. */
function hyphenProbe(net: NetworkId): PrefetchItem[] {
  return !isDevnet(net) && endpoint(net, 'hyphen')
    ? [prefetchItem('http', healthQueries.hyphen(net))]
    : []
}

/** `/`: the census and Platform Explorer's figure, which stands in until the SDK answers. Core data streams in. */
export function homePrefetch(net: NetworkId): PrefetchItem[] {
  if (isDevnet(net)) return []
  return [
    prefetchItem('http', radarQueries.summary(net)),
    prefetchItem('http', peQueries.status(net)),
    ...hyphenProbe(net),
  ]
}

/** `/blocks`: the day's rows are a DAPI list, which a loader never starts (§4.7). */
export const blocksPrefetch = hyphenProbe

/** `/block/$id`: the block itself is the one DAPI read a detail route may start, and the page waits for it. */
export function blockPrefetch(net: NetworkId, id: string): PrefetchItem[] {
  const ref = parseBlockRef(id)
  if (!ref) return []
  return [
    prefetchItem('dapi', coreQueries.block(net, ref), { detail: true, wait: true }),
    ...hyphenProbe(net),
  ]
}

/** `/tx/$txid`: likewise for the transaction. */
export function txPrefetch(net: NetworkId, txid: string): PrefetchItem[] {
  if (!TXID.test(txid)) return []
  return [
    prefetchItem('dapi', coreQueries.tx(net, txid), { detail: true, wait: true }),
    ...hyphenProbe(net),
  ]
}
