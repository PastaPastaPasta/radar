import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

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
