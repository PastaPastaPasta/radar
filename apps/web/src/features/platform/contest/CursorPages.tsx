import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { Sourced } from '@/data/envelope'

export const CURSOR_PAGE = 25

/**
 * Page `target` of a list whose pages are found by cursor: each page starts after the last row of the one before, so
 * the pages above it load in turn. `queryFor` builds the query for one page (one row more than a page, to know
 * whether another follows); `render` draws the page asked for.
 */
export function CursorPages<T, K extends QueryKey>({
  at = 1,
  target,
  cursor,
  queryFor,
  cursorOf,
  render,
}: {
  at?: number
  target: number
  cursor: string | undefined
  queryFor: (cursor: string | undefined) => UseQueryOptions<Sourced<T[]>, Error, Sourced<T[]>, K>
  cursorOf: (row: T) => string
  render: (step: UseQueryResult<Sourced<T[]>>) => ReactNode
}) {
  const step = useQuery(queryFor(cursor))
  const rows = step.data?.data
  const last = rows?.[CURSOR_PAGE - 1]
  if (at < target && rows && last !== undefined) {
    return (
      <CursorPages
        at={at + 1}
        target={target}
        cursor={cursorOf(last)}
        queryFor={queryFor}
        cursorOf={cursorOf}
        render={render}
      />
    )
  }
  return render(step)
}
