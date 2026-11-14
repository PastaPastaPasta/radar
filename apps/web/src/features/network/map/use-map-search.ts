import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import type { MnFilter } from '@/data/masternodes/filter'
import { filterFields } from '../masternodes/filter-fields'
import type { ColorMode } from './map-model'

/** What `/map` reads from its address (the route's schema, with its defaults filled in). */
export interface MapSearch extends MnFilter {
  layer: 'mn' | 'nodes'
  color: ColorMode
  hide?: string[] | undefined
  protx?: string | undefined
}

type Change = { [K in keyof MapSearch]?: MapSearch[K] | undefined }

export interface MapSearchControls {
  search: MapSearch
  filter: MnFilter
  hidden: ReadonlySet<string>
  /** A change to the view: the address is replaced, never stacked, so Back leaves the map. */
  set: (change: Change) => void
}

export function useMapSearch(): MapSearchControls {
  const search: MapSearch = useSearch({ from: '/map' })
  const navigate = useNavigate()
  const set = useCallback(
    (change: Change) => {
      void navigate({
        to: '/map',
        replace: true,
        resetScroll: false,
        search: ((prev: Record<string, unknown>) => ({ ...prev, ...change })) as never,
      })
    },
    [navigate],
  )
  const filter = useMemo(() => filterFields(search), [search])
  const hidden = useMemo(() => new Set(search.hide ?? []), [search.hide])
  return { search, filter, hidden, set }
}
