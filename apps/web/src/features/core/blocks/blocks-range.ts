export const BLOCKS_PER_PAGE = 20
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
 * The page of blocks `[floor, ceiling]` that starts at `from` (the newest by default), `BLOCKS_PER_PAGE` rows at a time,
 * with the cursors for the pages either side.
 */
export function windowOf(ceiling: number, floor: number, from: number | undefined): Window | null {
  if (ceiling < floor) return null
  const top = Math.min(Math.max(from ?? ceiling, floor), ceiling)
  const count = Math.min(BLOCKS_PER_PAGE, top - floor + 1)
  const newerTop = top + BLOCKS_PER_PAGE
  return {
    top,
    count,
    newer: top === ceiling ? null : newerTop >= ceiling ? {} : { from: newerTop },
    older: top - count >= floor ? { from: top - count } : null,
  }
}
