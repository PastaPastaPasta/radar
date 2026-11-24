import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import type { BlockRow } from '@/data/core/types'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { insQueries } from '@/data/insight/queries'
import type { NetworkId } from '@/lib/network'
import { spanAbove, spanBelow, type Span } from './blocks-range'

export type RowSource = 'dapi' | 'hyphen' | 'insight'

export interface ScrollPage {
  k: number
  span: Span
  rows: BlockRow[]
  settled: boolean
  failed: boolean
  stamp: SourceStamp | undefined
  refetch: () => void
}

/** Marks Insight's rows locked up to the best ChainLock DAPI reports, with the one-node qualifier it carries. */
export function withBestLock(
  rows: BlockRow[],
  best: { height: number; claim?: 'one-node' } | undefined,
): BlockRow[] {
  return rows.map((r) =>
    best === undefined || r.height > best.height
      ? r
      : best.claim
        ? { ...r, chainLockClaim: 'one-node' as const }
        : { ...r, chainLocked: true },
  )
}

const lowestOf = (rows: BlockRow[]) =>
  rows.length > 0 ? Math.min(...rows.map((r) => r.height)) : undefined

/**
 * The pages around page 0 that a scrolling blocks list shows, `lo` (≤ 0) to `hi` (≥ 0). Pages above sit on a grid from
 * page 0's newest height up to the tip; each page below starts under the one before it. A page read from Insight can
 * come back short, so the next one starts at the lowest height it holds and no block is skipped; that page below is
 * only known once the one above it has landed. Each page is one read: DAPI's block reads go four at a time inside it.
 */
export function useScrollPages(opts: {
  net: NetworkId
  source: RowSource
  /** Page 0: its newest height, count and rows (the page the URL names). */
  base: { top: number; count: number; rows: BlockRow[]; settled: boolean } | null
  ceiling: number
  floor: number
  size: number
  lo: number
  hi: number
}): ScrollPage[] {
  const { net, source, base, ceiling, floor, size, lo, hi } = opts
  const client = useQueryClient()
  const wanted: { k: number; span: Span }[] = []
  if (base) {
    for (let k = lo; k <= Math.min(hi, -1); k++) {
      const span = spanAbove(k, base.top, ceiling, size)
      if (span) wanted.push({ k, span })
    }
    // Below page 0 a page starts under the one before it: arithmetic for DAPI and Hyphen, which give every row they are
    // asked for, and the lowest row Insight actually returned, read from the cache, since its pages can come back short.
    let bottom: number | undefined =
      source === 'insight'
        ? base.settled
          ? lowestOf(base.rows)
          : undefined
        : base.top - base.count + 1
    for (let k = 1; k <= hi && bottom !== undefined; k++) {
      const span = spanBelow(bottom, floor, size)
      if (!span) break
      if (k >= lo) wanted.push({ k, span })
      if (source === 'insight') {
        const landed = client.getQueryData<{ rows: BlockRow[] }>(
          insQueries.blocksPage(net, { top: span.top, count: span.count }).queryKey,
        )
        bottom = landed && landed.rows.length > 0 ? lowestOf(landed.rows) : undefined
      } else {
        bottom = span.top - span.count + 1
      }
    }
  }
  const lock = useQuery({
    ...coreQueries.chainLock(net),
    enabled: source === 'insight' && base !== null && (lo < 0 || hi > 0),
  })
  const results = useQueries({
    queries: wanted.map(({ span }) => {
      const bottom = span.top - span.count + 1
      // The newest page grows a block at a time, so its read changes; it keeps showing what it had until the next lands.
      const samePage = (prev: unknown, prevQuery?: { queryKey: readonly unknown[] }) => {
        const q = prevQuery?.queryKey.at(-1) as
          { from?: number; top?: number; count?: number } | undefined
        const prevTop = q?.from ?? q?.top
        return q?.count !== undefined && prevTop !== undefined && prevTop - q.count + 1 === bottom
          ? prev
          : undefined
      }
      return source === 'insight'
        ? {
            ...insQueries.blocksPage(net, { top: span.top, count: span.count }),
            placeholderData: samePage as never,
          }
        : {
            ...coreQueries.blockRows(net, {
              fromHeight: span.top,
              count: span.count,
              ...(source === 'hyphen' ? { via: 'index' as const } : {}),
            }),
            placeholderData: samePage as never,
          }
    }),
  })
  const best = lock.data?.data
  return wanted.map(({ k, span }, i) => {
    const r = results[i]!
    const data = r.data as unknown
    const rows =
      source === 'insight'
        ? withBestLock((data as { rows: BlockRow[] } | undefined)?.rows ?? [], best)
        : ((data as { data: BlockRow[] } | undefined)?.data ?? [])
    const stamp =
      data === undefined
        ? undefined
        : source === 'insight'
          ? stampOf((data as { list: Parameters<typeof stampOf>[0] }).list)
          : stampOf(data as Parameters<typeof stampOf>[0])
    return {
      k,
      span,
      rows,
      settled: r.isSuccess && !r.isPlaceholderData,
      failed: r.isError && r.data === undefined,
      stamp,
      refetch: () => void r.refetch(),
    }
  })
}

/**
 * The address the scrolling list last wrote for itself (path and query). The router hears of those writes; one that
 * matches is the list keeping its place, not a navigation, so the route does not start the list over.
 */
export const listWrites: { href?: string } = {}
