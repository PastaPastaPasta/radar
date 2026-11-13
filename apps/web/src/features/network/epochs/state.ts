import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { LoadState } from '@/ui'

export interface QueryView {
  state: LoadState
  error: unknown
  onRetry: () => void
}

/** What a card or table needs to show a query: loading until it has an answer, an error only when nothing is left to show. */
export function queryView(query: {
  data: unknown
  isError: boolean
  error: unknown
  refetch: () => Promise<unknown>
}): QueryView {
  return {
    state: query.data !== undefined ? 'ready' : query.isError ? 'error' : 'loading',
    error: query.error,
    onRetry: () => void query.refetch(),
  }
}

/** The stamps of the answers that have arrived. */
export function stampsOf(...answers: (Sourced<unknown> | undefined)[]): SourceStamp[] {
  return answers.flatMap((a) => (a ? [stampOf(a)] : []))
}

/** Sorts a copy of `rows` by a sort value (`-id` descending): ties keep their order, so a re-sort is stable. */
export function sortRows<Row>(
  rows: readonly Row[],
  sort: string,
  keys: Record<string, (row: Row) => number | bigint | string>,
): Row[] {
  const desc = sort.startsWith('-')
  const key = keys[desc ? sort.slice(1) : sort]
  if (!key) return [...rows]
  const sign = desc ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    return x === y ? 0 : x < y ? -sign : sign
  })
}

/** True once the browser has had an idle moment after first paint, so loading the SDK never competes with it (§3.3). */
export function useAfterIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    const cancel = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    if (!ric) {
      const timer = setTimeout(() => setIdle(true), 1)
      return () => clearTimeout(timer)
    }
    const id = ric(() => setIdle(true))
    return () => cancel?.(id)
  }, [])
  return idle
}

/**
 * Show-more paging for a table sorted through the page's `sort` search param: `shown` rows of `rowCount`, with the
 * table's `sort.onChange` (which starts over at the first page) and `paging` props.
 */
export function useSortedPaging(pageSize: number, rowCount: number) {
  const navigate = useNavigate()
  const [shown, setShown] = useState(pageSize)
  return {
    shown,
    onSort: (next: string) => {
      setShown(pageSize)
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, sort: next })) as never,
      })
    },
    paging:
      shown < rowCount
        ? {
            kind: 'infinite' as const,
            hasNext: true,
            fetching: false,
            fetchNext: () => {
              setShown((n) => n + pageSize)
            },
          }
        : undefined,
  }
}
