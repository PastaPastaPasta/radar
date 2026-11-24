import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback } from 'react'

const useAnySearch = (): Record<string, unknown> => useSearch({ strict: false })

type Change = Record<string, unknown>

export interface ListControls<S> {
  search: S
  /** A filter change: replaces the history entry and starts the list again from the top. */
  filter: (change: Change) => void
}

/** The address of one scrolling list, and its filter changes. */
export function useListControls<S extends { page: number; limit: number }>(
  to: '/platform/blocks' | '/platform/txs' | '/tokens',
): ListControls<S> {
  const search = useAnySearch() as S
  const navigate = useNavigate()
  return {
    search,
    filter: useCallback(
      (change: Change) => {
        void navigate({
          to,
          replace: true,
          search: ((prev: Record<string, unknown>) => ({
            ...prev,
            ...change,
            page: undefined,
          })) as never,
        })
      },
      [navigate, to],
    ),
  }
}
