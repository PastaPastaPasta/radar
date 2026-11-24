import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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
  // Where each Insight page ended, kept here because pages scrolled out of the window stop being observed and may leave
  // the cache, while the pages under them still start from there.
  const [bottoms, setBottoms] = useState<Record<string, number>>({})
  // The newest page's read changes with each block; its last rows stay on screen until the next read lands.
  const [held, setHeld] = useState<Record<string, BlockRow[]>>({})
  const chain = (k: number) => `${base?.top ?? ''}:${k}`
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
        bottom =
          bottoms[chain(k)] ??
          (landed && landed.rows.length > 0 ? lowestOf(landed.rows) : undefined)
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
    queries: wanted.map(({ span }) =>
      source === 'insight'
        ? insQueries.blocksPage(net, { top: span.top, count: span.count })
        : coreQueries.blockRows(net, {
            fromHeight: span.top,
            count: span.count,
            ...(source === 'hyphen' ? { via: 'index' as const } : {}),
          }),
    ),
  })
  const landed = wanted.map(({ k, span }, i) => {
    const data = results[i]!.data as unknown
    const rows =
      data === undefined
        ? undefined
        : source === 'insight'
          ? (data as { rows: BlockRow[] }).rows
          : (data as { data: BlockRow[] }).data
    return { k, span, rows }
  })
  const landedKey = landed.map((p) => `${p.k}:${p.span.top}:${p.rows?.length ?? '-'}`).join(',')
  const [seenKey, setSeenKey] = useState('')
  if (landedKey !== seenKey) {
    setSeenKey(landedKey)
    const nextBottoms: Record<string, number> = {}
    const nextHeld: Record<string, BlockRow[]> = {}
    for (const p of landed) {
      if (!p.rows) continue
      const lowest = lowestOf(p.rows)
      if (source === 'insight' && lowest !== undefined) nextBottoms[chain(p.k)] = lowest
      if (p.k < 0) nextHeld[chain(p.k)] = p.rows
    }
    setBottoms((b) => ({ ...b, ...nextBottoms }))
    setHeld((h) => ({ ...h, ...nextHeld }))
  }
  const best = lock.data?.data
  return wanted.map(({ k, span }, i) => {
    const r = results[i]!
    const data = r.data as unknown
    const own = landed[i]!.rows
    // Only the newest page (k < 0, still filling) shows what it held while its next read is on its way.
    const shown = own ?? (k < 0 ? (held[chain(k)] ?? []) : [])
    const rows = source === 'insight' ? withBestLock(shown, best) : shown
    const stamp =
      data === undefined
        ? undefined
        : source === 'insight'
          ? stampOf((data as { list: Parameters<typeof stampOf>[0] }).list)
          : stampOf(data as Parameters<typeof stampOf>[0])
    // An Insight page above page 0 that came back short would leave a gap above the next page; it counts as failed so
    // the reader is offered a retry rather than missing blocks.
    const shortAbove =
      source === 'insight' &&
      k < 0 &&
      own !== undefined &&
      (lowestOf(own) ?? Infinity) > span.top - span.count + 1
    return {
      k,
      span,
      rows,
      settled: r.isSuccess && !shortAbove,
      failed: (r.isError && r.data === undefined) || shortAbove,
      stamp,
      refetch: () => void r.refetch(),
    }
  })
}
