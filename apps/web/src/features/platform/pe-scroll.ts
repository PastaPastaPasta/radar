import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { stampOf, type Sourced, type SourceStamp } from '@/data/envelope'
import type { Page } from '@/data/page'
import { usePageChain, type PageChain } from '@/features/entity'

export interface PeScroll<Row> extends PageChain<Sourced<Page<Row>>, number, Row> {
  /** Platform Explorer's count of the whole list, from the first page shown. */
  total: number | undefined
  stamps: SourceStamp[]
}

/**
 * A Platform Explorer list read page by page as the reader scrolls, from the page the address names. `listKey` holds
 * the filters and page size: a change starts the list again.
 */
export function usePeScroll<Row, K extends QueryKey>(opts: {
  listKey: string
  start: number
  limit: number
  page: (page: number) => UseQueryOptions<Sourced<Page<Row>>, Error, Sourced<Page<Row>>, K>
  getRowId: (row: Row) => string
  /** Rows of a page that are shown, for a filter Platform Explorer can't apply. */
  keep?: (row: Row) => boolean
  enabled?: boolean
}): PeScroll<Row> {
  const { limit, keep } = opts
  const chain = usePageChain({
    listKey: `${opts.listKey}\u0000${limit}`,
    start: Math.max(1, opts.start),
    query: opts.page,
    rows: (p: Sourced<Page<Row>>) => (keep ? p.data.items.filter(keep) : p.data.items),
    getRowId: opts.getRowId,
    next: (p, n) =>
      (p.data.total === undefined ? p.data.items.length >= limit : n * limit < p.data.total)
        ? n + 1
        : undefined,
    prev: (n) => (n > 1 ? n - 1 : undefined),
    enabled: opts.enabled,
  })
  const loaded = chain.pages.flatMap((p) => (p.data ? [p.data] : []))
  return { ...chain, total: loaded[0]?.data.total, stamps: loaded.map(stampOf) }
}
