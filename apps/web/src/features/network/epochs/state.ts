import { useNavigate } from '@tanstack/react-router'
import { useReveal } from '@/ui'

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
 * Infinite scroll for a table sorted through the page's `sort` search param: `shown` rows of `rowCount`, with the
 * table's `sort.onChange` (a new sort starts over at the top) and `paging` props.
 */
export function useSortedPaging(pageSize: number, rowCount: number, sort: string) {
  const navigate = useNavigate()
  const reveal = useReveal({ total: rowCount, step: pageSize, reset: sort })
  return {
    shown: reveal.count,
    onSort: (next: string) => {
      void navigate({
        to: '.',
        search: ((prev: Record<string, unknown>) => ({ ...prev, sort: next })) as never,
      })
    },
    paging: reveal.paging,
  }
}
