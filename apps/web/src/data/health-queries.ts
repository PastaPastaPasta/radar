import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { hyphen } from './hyphen/client'
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

/** Freshness probes, `[net, 'health', source]`. Mounted only where a card uses the source, and on /status. */
export const healthQueries = {
  radar: (net: NetworkId) =>
    queryOptions({
      queryKey: healthKeys(net, 'radar'),
      queryFn: ({ signal }) => radar.status(signal),
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
        const radarStatus = await radar.status(signal).catch(() => undefined)
        const key = net === 'testnet' ? 'testnet' : 'mainnet'
        const tip = radarStatus?.data.networks[key].chain.blocks
        return hyphen.status(net, signal, tip)
      },
      ...probe,
    }),
}
