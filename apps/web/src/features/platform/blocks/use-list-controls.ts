import { useNavigate, useSearch, type LinkProps } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import { useListMode } from '@/ui'

const DEFAULT_LIMIT = 25

const useAnySearch = (): Record<string, unknown> => useSearch({ strict: false })

type Change = Record<string, unknown>

export interface ListControls<S> {
  search: S
  mode: 'pages' | 'scroll'
  /** Rows per page: the remembered size, or the address's own when a link carries one. */
  limit: number
  /** A filter change: replaces the history entry and goes back to page one. */
  filter: (change: Change) => void
  /** A page change: a new history entry. */
  goto: (page: number) => void
  /** Keeps the address's page in step with the pages an infinite list has loaded. */
  loaded: (pages: number) => void
  link: (page: number) => LinkProps
}

/**
 * The address and the remembered list mode of one list. The remembered mode and page size are the ones the toggle
 * shows; changing either drops the address's `limit` and page.
 */
export function useListControls<S extends { page: number; limit: number }>(
  to: '/platform/blocks' | '/platform/txs' | '/tokens',
  listId: string,
): ListControls<S> {
  const search = useAnySearch() as S
  const navigate = useNavigate()
  const { mode, limit: remembered } = useListMode(listId)
  const limit = search.limit === DEFAULT_LIMIT ? remembered : search.limit

  const go = useCallback(
    (change: Change, replace: boolean, resetPage: boolean) => {
      void navigate({
        to,
        replace,
        search: ((prev: Record<string, unknown>) => ({
          ...prev,
          ...change,
          ...(resetPage ? { page: undefined } : {}),
        })) as never,
      })
    },
    [navigate, to],
  )

  const seen = useRef({ mode, remembered })
  useEffect(() => {
    if (seen.current.mode === mode && seen.current.remembered === remembered) return
    seen.current = { mode, remembered }
    go({ limit: undefined }, true, true)
  }, [mode, remembered, go])

  return {
    search,
    mode,
    limit,
    filter: useCallback((change) => go(change, true, true), [go]),
    goto: useCallback((page) => go({ page }, false, false), [go]),
    loaded: useCallback((pages) => go({ page: pages }, true, false), [go]),
    link: useCallback(
      (page) => ({
        to,
        search: ((prev: Record<string, unknown>) => ({ ...prev, page })) as never,
      }),
      [to],
    ),
  }
}
