import { useNavigate, useSearch, type LinkProps } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import { NEWEST_FIRST, textFilter, tokensQuery, type TokensSearch } from '@/data/pe/tokens-query'
import { useListMode } from '@/ui'

export const TOKENS_LIST_ID = 'tokens'
const DEFAULT_LIMIT = 25

export { NEWEST_FIRST, textFilter, tokensQuery, type TokensSearch }

type Change = Record<string, unknown>

const useAnySearch = (): Record<string, unknown> => useSearch({ strict: false })

/**
 * The address and the remembered list mode of the token list. Changing a filter replaces the history entry and goes
 * back to page one; changing the mode or page size drops the address's `limit` and page.
 */
export function useTokenListControls() {
  const search = useAnySearch() as unknown as TokensSearch
  const navigate = useNavigate()
  const { mode, limit: remembered } = useListMode(TOKENS_LIST_ID)
  const limit = search.limit === DEFAULT_LIMIT ? remembered : search.limit

  const go = useCallback(
    (change: Change, replace: boolean, resetPage: boolean) => {
      void navigate({
        to: '/tokens',
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
    filter: useCallback((change: Change) => go(change, true, true), [go]),
    loaded: useCallback((pages: number) => go({ page: pages }, true, false), [go]),
    link: useCallback(
      (page: number): LinkProps => ({
        to: '/tokens',
        search: ((prev: Record<string, unknown>) => ({ ...prev, page })) as never,
      }),
      [],
    ),
  }
}
