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

/** Hyphen and Radar are read through Workers, where every request counts against a daily allowance. */
export const WORKER_PROBE_INTERVAL_MS = 5 * 60_000

const probeEvery = (ms: number) =>
  ({ staleTime: ms, gcTime: 5 * 60_000, refetchInterval: ms, retry: false }) as const

const probe = probeEvery(HEALTH_PROBE_INTERVAL_MS)
const workerProbe = probeEvery(WORKER_PROBE_INTERVAL_MS)

/** How long a page waits on DAPI's tip before it also asks Radar's crawl for one. */
export const CRAWL_TIP_GRACE_MS = 1_500

/** How old the crawl's own reading of the chain may be before its height is no reference. The crawler updates it about every minute or two. */
export const CRAWL_TIP_MAX_AGE_MS = 5 * 60_000

/**
 * The chain tip an index is measured against: DAPI's best height, else the height of Radar's last crawl, taken only
 * while the crawler's node is synced, reports no error and read the chain within `CRAWL_TIP_MAX_AGE_MS`. A tip a
 * stand-in index gave (DAPI down) is no reference for that same index. Radar is asked only when DAPI has failed or not
 * answered within `CRAWL_TIP_GRACE_MS`, and then the first to answer decides; DAPI's tip, when it lands later, measures
 * the index again.
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
  // Radar's status is a Worker request on every page, so it is asked only once DAPI has failed or kept the page waiting.
  const fromCrawl = new Promise<number | undefined>((resolve) => {
    let asked = false
    const ask = () => {
      if (asked) return
      asked = true
      clearTimeout(timer)
      if (signal.aborted) resolve(undefined)
      else void crawl().then(resolve)
    }
    const timer = setTimeout(ask, CRAWL_TIP_GRACE_MS)
    void fromDapi.then((height) => {
      if (height === undefined) ask()
      else if (!asked) {
        clearTimeout(timer)
        resolve(undefined)
      }
    })
  })
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
  timing: ReturnType<typeof probeEvery>,
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
      ...timing,
    })
}

/** Freshness probes, `[net, 'health', source]`. Mounted only where a card uses the source, and on /status. */
export const healthQueries = {
  radar: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'radar'),
      queryFn: ({ signal }) => radar.status(signal, net, { probe: true }),
      ...workerProbe,
    }),
  pe: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'pe'),
      queryFn: ({ signal }) => pe.status(net, signal, { probe: true }),
      ...probe,
    }),
  hyphen: indexProbe(
    'hyphen',
    (net, signal, tip) => hyphen.status(net, signal, tip, { probe: true }),
    workerProbe,
  ),
  insight: indexProbe(
    'insight',
    (net, signal, tip) => insight.status(net, signal, tip, { probe: true }),
    probe,
  ),
}
