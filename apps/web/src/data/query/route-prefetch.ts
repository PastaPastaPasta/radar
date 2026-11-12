import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'
import { parseBlockRef } from '@/lib/core/block-ref'
import { coreQueries } from '../core/queries'
import type { CoreCallOptions } from '../core/types'
import { endpoint } from '../endpoints'
import { healthQueries } from '../health-queries'
import { hyQueries } from '../hyphen/queries'
import { rememberedIndexState } from '../index-state'
import { insQueries } from '../insight/queries'
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

/** A hover or focus preload queues behind the reads a visible page needs. */
function callOptions(preload: boolean): CoreCallOptions {
  return { priority: preload ? 'prefetch' : 'detail' }
}

/** `/block/$id`: the block itself is the one DAPI read a detail route may start, and the page waits for it. */
export function blockPrefetch(net: NetworkId, id: string, preload = false): PrefetchItem[] {
  const ref = parseBlockRef(id)
  if (!ref) return []
  return [
    prefetchItem('dapi', coreQueries.block(net, ref, callOptions(preload)), {
      detail: true,
      wait: true,
    }),
    ...hyphenProbe(net),
  ]
}

/** `/tx/$txid`: likewise for the transaction. */
export function txPrefetch(net: NetworkId, txid: string, preload = false): PrefetchItem[] {
  if (!TXID.test(txid)) return []
  return [
    prefetchItem('dapi', coreQueries.tx(net, txid, callOptions(preload)), {
      detail: true,
      wait: true,
    }),
    ...hyphenProbe(net),
  ]
}

/** Insight reads the index when the last probe found Hyphen's stale; the first visit starts with Hyphen's, as the probe has not run. */
const readsInsight = (net: NetworkId): boolean =>
  rememberedIndexState(net) === 'stale' && endpoint(net, 'insight') !== null

/** `/address/$address`: the summary, from whichever index the page will read. */
export function addressPrefetch(net: NetworkId, address: string): PrefetchItem[] {
  return [
    ...hyphenProbe(net),
    readsInsight(net)
      ? prefetchItem('http', insQueries.address(net, address), { wait: true })
      : prefetchItem('http', hyQueries.address(net, address), { wait: true }),
  ]
}

/** `/governance`: the proposal list. */
export function proposalsPrefetch(net: NetworkId): PrefetchItem[] {
  return [
    ...hyphenProbe(net),
    readsInsight(net)
      ? prefetchItem('http', insQueries.proposalPage(net), { wait: true })
      : prefetchItem('http', hyQueries.proposals(net, { limit: 100 }), { wait: true }),
  ]
}

/** `/governance/$hash`: one proposal, found in Insight's list when that is the index in use. */
export function proposalPrefetch(net: NetworkId, hash: string): PrefetchItem[] {
  return [
    ...hyphenProbe(net),
    readsInsight(net)
      ? prefetchItem('http', insQueries.proposalPage(net), { wait: true })
      : prefetchItem('http', hyQueries.proposal(net, hash), { wait: true }),
  ]
}
