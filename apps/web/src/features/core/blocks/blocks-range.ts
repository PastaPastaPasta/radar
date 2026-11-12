export const BLOCKS_PER_PAGE = 20
/** Page sizes on offer. Past `BLOCKS_PER_PAGE` a page comes from an index list in one request, not from DAPI block by block. */
export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export const isPageSize = (n: number | undefined): n is PageSize => PAGE_SIZES.some((s) => s === n)
/** Rows read first on a page: one round of block reads, so something shows as soon as the first nodes answer. */
export const FIRST_CHUNK = 4
export const DAY_MS = 86_400_000

export function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

export function shiftDay(date: string, days: number): string {
  return new Date(dayStartMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface Window {
  /** Height of the newest row on this page. */
  top: number
  count: number
  /** Search for the page of newer blocks, or null on the newest page. */
  newer: { from?: number } | null
  /** Search for the page of older blocks, or null when this is the last one. */
  older: { from: number } | null
}

/**
 * The page of blocks `[floor, ceiling]` that starts at `from` (the newest by default), `size` rows at a time,
 * with the cursors for the pages either side.
 */
export function windowOf(
  ceiling: number,
  floor: number,
  from: number | undefined,
  size: number = BLOCKS_PER_PAGE,
): Window | null {
  if (ceiling < floor) return null
  const top = Math.min(Math.max(from ?? ceiling, floor), ceiling)
  const count = Math.min(size, top - floor + 1)
  const newerTop = top + size
  return {
    top,
    count,
    newer: top === ceiling ? null : newerTop >= ceiling ? {} : { from: newerTop },
    older: top - count >= floor ? { from: top - count } : null,
  }
}
