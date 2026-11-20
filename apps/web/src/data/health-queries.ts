import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from './envelope'
import { healthRegistry } from './health'
import { hyphen } from './hyphen/client'
import { insight } from './insight/client'
import { pe } from './pe/client'
import { earlyAnswers } from './early'
import { sourceInUse } from './endpoints'
import type { ReferenceTip } from './index-state'
import { healthKeys } from './query/keys'
import { radar } from './radar/client'

export const HEALTH_PROBE_INTERVAL_MS = 60_000

const probe = {
  staleTime: HEALTH_PROBE_INTERVAL_MS,
  gcTime: 5 * 60_000,
  refetchInterval: HEALTH_PROBE_INTERVAL_MS,
  retry: false,
} as const

/** How old the crawl's own reading of the chain may be before its height is no reference. The crawler updates it about every minute or two. */
export const CRAWL_TIP_MAX_AGE_MS = 5 * 60_000

/**
 * The chain tip an index is measured against: DAPI's best height, else the height of Radar's last crawl, taken only
 * while the crawler's node is synced, reports no error and read the chain within `CRAWL_TIP_MAX_AGE_MS`. A tip a
 * stand-in index gave (DAPI down) is no reference for that same index. Both are asked at once and the first to answer
 * decides, so a page that reads an index waits for one request, not for DAPI's two; DAPI's tip, when it lands later,
 * measures the index again.
 */
function referenceTip(net: NetworkId, signal: AbortSignal): ReferenceTip {
  const key = net === 'testnet' ? 'testnet' : 'mainnet'
  const fromDapi = import('./core/client')
    .then((m) => m.core.tip(net, signal))
    .then((tip) => (tip.fallback ? undefined : tip.data.height))
    .catch(() => undefined)
  const crawl = () =>
    radar
      .status(signal, key, { probe: true })
      .then(({ data }) => {
        const chain = data.networks[key].chain
        const current =
          chain.synced && !chain.error && Date.now() - chain.updated <= CRAWL_TIP_MAX_AGE_MS
        return current ? chain.blocks : undefined
      })
      .catch(() => undefined)
  if (!earlyAnswers() || !sourceInUse(net, 'radar')) {
    const tip = fromDapi.then((height) => height ?? crawl())
    return { first: tip, final: tip }
  }
  const fromCrawl = crawl()
  const first = new Promise<number | undefined>((resolve) => {
    let left = 2
    for (const p of [fromDapi, fromCrawl]) {
      void p.then((height) => {
        if (height !== undefined) resolve(height)
        else if (--left === 0) resolve(undefined)
      })
    }
  })
  return { first, final: fromDapi.then((height) => height ?? fromCrawl) }
}

/** An index source's probe: its status, measured against `referenceTip`. With no tip to measure against it claims no lag, and the state it was last decided in stands (`HealthRegistry.setLag`). */
function indexProbe<T>(
  source: 'hyphen' | 'insight',
  status: (net: NetworkId, signal: AbortSignal, tip: ReferenceTip) => Promise<Sourced<T>>,
) {
  return (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, source),
      queryFn: ({ signal }) => {
        const tip = referenceTip(net, signal)
        void tip.first.then((height) => {
          if (height === undefined) healthRegistry.setLag(net, source, undefined)
        })
        return status(net, signal, tip)
      },
      ...probe,
    })
}

/** Freshness probes, `[net, 'health', source]`. Mounted only where a card uses the source, and on /status. */
export const healthQueries = {
  radar: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'radar'),
      queryFn: ({ signal }) => radar.status(signal, net, { probe: true }),
      ...probe,
    }),
  pe: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'pe'),
      queryFn: ({ signal }) => pe.status(net, signal, { probe: true }),
      ...probe,
    }),
  hyphen: indexProbe('hyphen', (net, signal, tip) =>
    hyphen.status(net, signal, tip, { probe: true }),
  ),
  insight: indexProbe('insight', (net, signal, tip) =>
    insight.status(net, signal, tip, { probe: true }),
  ),
}
