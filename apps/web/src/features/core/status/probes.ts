import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Sourced } from '@/data/envelope'
import { sourceInUse } from '@/data/endpoints'
import { useDecentralizedOnly } from '@/data/health'
import { HEALTH_PROBE_INTERVAL_MS, healthQueries } from '@/data/health-queries'
import { platformTipQuery, type PlatformTip } from '@/data/sdk/queries'
import type { HyStatus } from '@/data/hyphen/schemas'
import type { InsStatus } from '@/data/insight/schemas'
import type { PeStatus } from '@/data/pe/schemas'
import type { RadarStatus } from '@/data/radar/schemas'
import type { NetworkId } from '@/lib/network'
import { offers } from './source-rows'

export interface Probes {
  radar: UseQueryResult<Sourced<RadarStatus>>
  pe: UseQueryResult<Sourced<PeStatus>>
  hyphen: UseQueryResult<Sourced<HyStatus>>
  insight: UseQueryResult<Sourced<InsStatus>>
  sdk: UseQueryResult<Sourced<PlatformTip>>
}

/**
 * The freshness probes (§2.5), run for as long as the status page is open. In Decentralized only mode only the SDK
 * is probed.
 */
export function useProbes(net: NetworkId): Probes {
  // Read so the probes start again when the mode is switched off.
  useDecentralizedOnly()
  return {
    radar: useQuery({ ...healthQueries.radar(net), enabled: sourceInUse(net, 'radar') }),
    pe: useQuery({ ...healthQueries.pe(net), enabled: sourceInUse(net, 'pe') }),
    hyphen: useQuery({ ...healthQueries.hyphen(net), enabled: sourceInUse(net, 'hyphen') }),
    insight: useQuery({ ...healthQueries.insight(net), enabled: sourceInUse(net, 'insight') }),
    // One proof-checked epoch read per visit, then once a minute like the others; it shares the home page's cache entry.
    sdk: useQuery({
      ...platformTipQuery(net),
      refetchInterval: HEALTH_PROBE_INTERVAL_MS,
      retry: false,
      enabled: offers(net, 'sdk'),
    }),
  }
}
