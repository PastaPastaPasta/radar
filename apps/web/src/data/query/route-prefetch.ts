import type { QueryClient } from '@tanstack/query-core'
import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'
import { parseBlockRef } from '@/lib/core/block-ref'
import { coreQueries } from '../core/queries'
import type { CoreCallOptions } from '../core/types'
import { sourceInUse } from '../endpoints'
import { healthQueries } from '../health-queries'
import { hyQueries } from '../hyphen/queries'
import { rememberedIndexState } from '../health'
import { insQueries } from '../insight/queries'
import { peQueries } from '../pe/queries'
import { radarQueries } from '../radar/queries'
import { prefetchItem, type PrefetchItem } from './loader'

const TXID = /^[0-9a-f]{64}$/i

/** Core pages ask whether Hyphen is fit (§4.7) before every Hyphen request, so its probe is the one thing worth starting early. */
function hyphenProbe(net: NetworkId): PrefetchItem[] {
  return !isDevnet(net) && sourceInUse(net, 'hyphen')
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

/** Insight reads the index when Hyphen's was found stale; until a probe has decided, nothing is known and Hyphen's is read. */
const readsInsight = (net: NetworkId): boolean =>
  rememberedIndexState(net) === 'stale' && sourceInUse(net, 'insight')

/** On a first visit the probe has not decided yet: wait for it (the loader's deadline bounds the wait). */
async function awaitFirstProbe(net: NetworkId, client: QueryClient): Promise<void> {
  if (rememberedIndexState(net) === undefined && sourceInUse(net, 'hyphen')) {
    await client.prefetchQuery(healthQueries.hyphen(net))
  }
}

/**
 * A read the stale rule routes (§4.7a). On a first visit the probe has not decided yet, so the loader waits for it (within
 * its deadline) before starting either read: a stale network never pays for a Hyphen read the page then throws away,
 * and the page never paints Hyphen's answer before it learns to read Insight's.
 */
function indexRead(
  net: NetworkId,
  pick: (from: 'hyphen' | 'insight') => PrefetchItem,
): PrefetchItem {
  return {
    cost: 'http',
    wait: true,
    async start(client) {
      await awaitFirstProbe(net, client)
      await pick(readsInsight(net) ? 'insight' : 'hyphen').start(client)
    },
  }
}

/** `/mempool`: Hyphen's summary once its index is known to be fresh. A stale index shows DAPI's live feed and asks Hyphen nothing. */
export function mempoolPrefetch(net: NetworkId): PrefetchItem[] {
  if (isDevnet(net)) return []
  return [
    {
      cost: 'http',
      wait: true,
      async start(client) {
        await awaitFirstProbe(net, client)
        if (rememberedIndexState(net) === 'stale') return
        await prefetchItem('http', hyQueries.mempool(net)).start(client)
      },
    },
  ]
}

/** `/address/$address`: the summary, from whichever index the page will read. */
export function addressPrefetch(net: NetworkId, address: string): PrefetchItem[] {
  return [
    ...hyphenProbe(net),
    indexRead(net, (from) =>
      from === 'insight'
        ? prefetchItem('http', insQueries.address(net, address))
        : prefetchItem('http', hyQueries.address(net, address)),
    ),
  ]
}

/** `/governance`: the proposal list. */
export function proposalsPrefetch(net: NetworkId): PrefetchItem[] {
  return [
    ...hyphenProbe(net),
    indexRead(net, (from) =>
      from === 'insight'
        ? prefetchItem('http', insQueries.proposalPage(net))
        : prefetchItem('http', hyQueries.proposals(net, { limit: 100 })),
    ),
  ]
}

/** `/governance/$hash`: one proposal, found in Insight's list when that is the index in use. */
export function proposalPrefetch(net: NetworkId, hash: string): PrefetchItem[] {
  return [
    ...hyphenProbe(net),
    indexRead(net, (from) =>
      from === 'insight'
        ? prefetchItem('http', insQueries.proposalPage(net))
        : prefetchItem('http', hyQueries.proposal(net, hash)),
    ),
  ]
}
