import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from './envelope'
import { healthRegistry } from './health'
import { hyphen } from './hyphen/client'
import { insight } from './insight/client'
import { pe } from './pe/client'
import { healthKeys } from './query/keys'
import { radar } from './radar/client'

export const HEALTH_PROBE_INTERVAL_MS = 60_000

const probe = {
  staleTime: HEALTH_PROBE_INTERVAL_MS,
  gcTime: 5 * 60_000,
  refetchInterval: HEALTH_PROBE_INTERVAL_MS,
  retry: false,
} as const

/**
 * The chain tip an index is measured against: DAPI's best height, else the height of Radar's last crawl. A tip
 * a stand-in index gave (DAPI down) is no reference for that same index.
 */
async function referenceTip(net: NetworkId, signal: AbortSignal): Promise<number | undefined> {
  const key = net === 'testnet' ? 'testnet' : 'mainnet'
  const dapi = await import('./core/client')
    .then((m) => m.core.tip(net, signal))
    .then((tip) => (tip.fallback ? undefined : tip.data.height))
    .catch(() => undefined)
  if (dapi !== undefined) return dapi
  return radar
    .status(signal, key, { probe: true })
    .then((s) => s.data.networks[key].chain.blocks)
    .catch(() => undefined)
}

/** An index source's probe: its status, measured against `referenceTip`. With no tip to measure against it claims no lag, and the state it was last decided in stands (`HealthRegistry.setLag`). */
function indexProbe<T>(
  source: 'hyphen' | 'insight',
  status: (net: NetworkId, signal: AbortSignal, tip: number | undefined) => Promise<Sourced<T>>,
) {
  return (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, source),
      queryFn: async ({ signal }) => {
        const tip = await referenceTip(net, signal)
        if (tip === undefined) healthRegistry.setLag(net, source, undefined)
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
  hyphen: indexProbe('hyphen', (net, signal, tip) => hyphen.status(net, signal, tip, { probe: true })),
  insight: indexProbe('insight', (net, signal, tip) => insight.status(net, signal, tip, { probe: true })),
}
