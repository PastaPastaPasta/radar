import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
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
    .status(signal, key)
    .then((s) => s.data.networks[key].chain.blocks)
    .catch(() => undefined)
}

/** Freshness probes, `[net, 'health', source]`. Mounted only where a card uses the source, and on /status. */
export const healthQueries = {
  radar: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'radar'),
      queryFn: ({ signal }) => radar.status(signal, net),
      ...probe,
    }),
  pe: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'pe'),
      queryFn: ({ signal }) => pe.status(net, signal),
      ...probe,
    }),
  hyphen: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'hyphen'),
      queryFn: async ({ signal }) => {
        const tip = await referenceTip(net, signal)
        if (tip === undefined) healthRegistry.setLag(net, 'hyphen', undefined)
        return hyphen.status(net, signal, tip)
      },
      ...probe,
    }),
  insight: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'insight'),
      queryFn: async ({ signal }) => {
        const tip = await referenceTip(net, signal)
        if (tip === undefined) healthRegistry.setLag(net, 'insight', undefined)
        return insight.status(net, signal, tip)
      },
      ...probe,
    }),
}
