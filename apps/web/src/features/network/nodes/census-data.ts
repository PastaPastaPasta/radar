import { useQuery } from '@tanstack/react-query'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import { v24Pending } from '@/data/radar/schemas'
import { isDevnet, type NetworkId } from '@/lib/network'
import { useNow } from '@/ui'
import { radarScope, type CensusScope } from './census-math'

/** The days a history range asks Radar for. */
export const CENSUS_DAYS = ['1', '7', '30', '90', '365'] as const
export type CensusDays = (typeof CENSUS_DAYS)[number]

/** How many of a version history's most common series the chart keeps by name (Radar's default `top` is 8). */
const HISTORY_TOP = 8

/** The census reads Radar's crawl; a devnet has none, and Decentralized only mode keeps Radar off. */
export function useCrawlAvailable(net: NetworkId): { available: boolean; off: boolean } {
  const off = useDecentralizedOnly()
  return { available: !off && !isDevnet(net), off }
}

/** Every Radar document the census page reads, each held back while the crawl is unavailable. */
export function useCensus(
  net: NetworkId,
  scope: CensusScope,
  range: CensusDays,
  overTime: boolean,
) {
  const { available: enabled } = useCrawlAvailable(net)
  const days = Number(range) as 1 | 7 | 30 | 90 | 365
  return {
    summary: useQuery({ ...radarQueries.summary(net), enabled }),
    status: useQuery({ ...radarQueries.status(net), enabled }),
    releases: useQuery({ ...radarQueries.releases(), enabled }),
    bench: useQuery({ ...radarQueries.bench(net), enabled }),
    versions: useQuery({
      ...radarQueries.history(net, {
        dim: 'version',
        scope: radarScope(scope),
        days,
        top: HISTORY_TOP,
      }),
      enabled: enabled && overTime,
    }),
    size: useQuery({
      ...radarQueries.history(net, { dim: 'totals', days }),
      enabled,
    }),
  }
}

export type Census = ReturnType<typeof useCensus>

/** Core 24's activation is pending, or went active less than 30 days ago (the rule the home uses too). */
export function useV24Pending(net: NetworkId): boolean {
  const q = useQuery({ ...radarQueries.activation(net), enabled: !isDevnet(net) })
  return v24Pending(q.data?.data, useNow())
}
