import type { FetchQueryOptions, QueryClient, QueryKey } from '@tanstack/query-core'
import type { NetworkId } from '@/lib/network'
import { isDevnet } from '@/lib/network'
import { parseBlockRef } from '@/lib/core/block-ref'
import { coreDecoder } from '../core/decode'
import { earlyAnswers } from '../early'
import { coreQueries, LATEST_BLOCK_ROWS } from '../core/queries'
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

/**
 * `/blocks`: the day's rows are a DAPI list, which a loader never starts (§4.7). The latest page (no date, no offset)
 * starts Hyphen's newest rows, which the page shows until DAPI's land.
 */
export function blocksPrefetch(
  net: NetworkId,
  { latest = false, preload = false }: { latest?: boolean; preload?: boolean } = {},
): PrefetchItem[] {
  return [
    ...(latest
      ? indexedFirst(net, preload, coreQueries.indexedLatestRows(net, LATEST_BLOCK_ROWS))
      : []),
    ...hyphenProbe(net),
  ]
}

/** Hyphen's answer the page shows while DAPI's is on its way (§4.7, indexed first); a hover preload does not ask for it. */
function indexedFirst<T, K extends QueryKey>(
  net: NetworkId,
  preload: boolean,
  query: FetchQueryOptions<T, Error, T, K>,
): PrefetchItem[] {
  return preload || !earlyAnswers() || isDevnet(net) || !sourceInUse(net, 'hyphen')
    ? []
    : [prefetchItem('http', query)]
}

/** A detail page's first answer is decoded by the Core wasm: its worker starts loading now, beside the reads. */
const warmDecoder: PrefetchItem = {
  cost: 'http',
  start() {
    coreDecoder.warm()
    return Promise.resolve()
  },
}

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
    ...indexedFirst(net, preload, coreQueries.indexedBlock(net, ref)),
    ...(preload || !earlyAnswers() ? [] : [warmDecoder]),
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
    ...indexedFirst(net, preload, coreQueries.indexedTx(net, txid)),
    ...(preload || !earlyAnswers() ? [] : [warmDecoder]),
    ...hyphenProbe(net),
  ]
}

/** Insight reads the index when Hyphen's was found stale; until a probe has decided, nothing is known and Hyphen's is read. */
const readsInsight = (net: NetworkId): boolean =>
  rememberedIndexState(net) === 'stale' && sourceInUse(net, 'insight')

/**
 * On a first visit the probe has not decided yet. Hyphen's read goes out beside it, since the two together cost one
 * round trip where one after the other cost two; the loader then waits for the probe (within its deadline). Pages
 * paint nothing from Hyphen until the probe has decided, so a stale verdict only wastes that one read.
 */
async function firstProbe(
  net: NetworkId,
  client: QueryClient,
  hyphenRead: PrefetchItem | undefined,
): Promise<{ speculative?: Promise<void> }> {
  if (rememberedIndexState(net) !== undefined || !sourceInUse(net, 'hyphen')) return {}
  const speculative = earlyAnswers() ? hyphenRead?.start(client).catch(() => undefined) : undefined
  await client.prefetchQuery(healthQueries.hyphen(net))
  return { speculative }
}

/**
 * A read the stale rule routes (§4.7a). The page never paints Hyphen's answer before it learns whether to read
 * Insight's; on a first visit Hyphen's read starts beside the probe (`firstProbe`).
 */
function indexRead(
  net: NetworkId,
  pick: (from: 'hyphen' | 'insight') => PrefetchItem,
): PrefetchItem {
  return {
    cost: 'http',
    wait: true,
    async start(client) {
      const { speculative } = await firstProbe(net, client, pick('hyphen'))
      if (speculative && !readsInsight(net)) return speculative
      await pick(readsInsight(net) ? 'insight' : 'hyphen').start(client)
    },
  }
}

/** `/mempool`: Hyphen's summary once its index is known to be fresh. A stale index shows DAPI's live feed. */
export function mempoolPrefetch(net: NetworkId): PrefetchItem[] {
  if (isDevnet(net)) return []
  const summary = prefetchItem('http', hyQueries.mempool(net))
  return [
    {
      cost: 'http',
      wait: true,
      async start(client) {
        const { speculative } = await firstProbe(net, client, summary)
        if (rememberedIndexState(net) === 'stale') return
        await (speculative ?? summary.start(client))
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
