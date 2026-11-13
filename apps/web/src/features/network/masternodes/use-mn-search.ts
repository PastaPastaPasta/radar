import { useNavigate, useSearch, type LinkProps } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { MnFilter } from '@/data/masternodes/filter'
import type { PlatformFilter } from '@/data/masternodes/platform'

/** What `/masternodes` reads from its address (the route's schema, with its defaults filled in). */
export interface MnPageSearch extends MnFilter {
  sort: string
  view: 'list' | 'platform'
  pf: PlatformFilter
  page: number
}

type Change = { [K in keyof MnPageSearch]?: MnPageSearch[K] | undefined }

export interface MnSearchControls {
  search: MnPageSearch
  /** A filter or search change: replaces the history entry and goes back to page one. */
  filter: (change: Change) => void
  /** A sort or view change: a new history entry, back on page one. */
  sort: (change: Change) => void
  /** A page change: a new history entry. */
  page: (page: number) => void
}

/** A link to another page of `/masternodes` that keeps the rest of the address. */
export const mnPageLink = (page: number): LinkProps => ({
  to: '/masternodes',
  search: ((prev: Record<string, unknown>) => ({ ...prev, page })) as never,
})

export function useMnSearch(): MnSearchControls {
  const search: MnPageSearch = useSearch({ strict: false })
  const navigate = useNavigate()
  const go = useCallback(
    (change: Change, replace: boolean, resetPage: boolean) => {
      void navigate({
        to: '/masternodes',
        replace,
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          ...change,
          ...(resetPage ? { page: undefined } : {}),
        })) as never,
      })
    },
    [navigate],
  )
  return {
    search,
    filter: useCallback((change) => go(change, true, true), [go]),
    sort: useCallback((change) => go(change, false, true), [go]),
    page: useCallback((page) => go({ page }, false, false), [go]),
  }
}
