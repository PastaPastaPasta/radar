import type { UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { Sourced } from '@/data/envelope'
import { stampOf } from '@/data/envelope'
import type { RadarSummary } from '@/data/radar/schemas'
import type { LoadState } from '@/ui'
import type { NetworkId } from '@/lib/network'
import type { CensusDays } from './census-data'
import type { CensusScope } from './census-math'

/** What every section reads: the route's search, the network and Radar's summary. */
export interface SectionProps {
  net: NetworkId
  scope: CensusScope
  versions: 'now' | 'time'
  days: CensusDays
  summary: UseQueryResult<Sourced<RadarSummary>>
}

export const loadState = (q: Pick<UseQueryResult, 'isPending' | 'isError' | 'data'>): LoadState =>
  q.data !== undefined ? 'ready' : q.isError ? 'error' : q.isPending ? 'loading' : 'ready'

export const stampsOf = (...qs: (Sourced<unknown> | undefined)[]) =>
  qs.flatMap((q) => (q ? [stampOf(q)] : []))

/** Changes the census page's search in place: no new history entry, no scroll reset, and the hash is kept. */
export function useCensusSearch(): (patch: {
  scope?: string
  versions?: 'now' | 'time'
  days?: CensusDays
}) => void {
  const navigate = useNavigate()
  return (patch) => {
    void navigate({
      to: '/nodes',
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...patch })) as never,
      replace: true,
      resetScroll: false,
      hash: true,
    })
  }
}
