import type { PeQuery } from './params'
import type { NumericRange } from '@/lib/search-schemas'

/** What `/platform/blocks` reads from its address (the route's schema, with its defaults filled in). */
export interface BlocksSearch {
  page: number
  limit: number
  height?: NumericRange | undefined
  epoch?: NumericRange | undefined
  proposer?: string | undefined
  gas?: NumericRange | undefined
  txs?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

export const HASH = /^[0-9a-f]{64}$/i
export const HEIGHT = /^\d{1,10}$/

export type BlockRef = { kind: 'hash'; hash: string } | { kind: 'height'; height: number }

export function parseBlockRef(id: string): BlockRef | undefined {
  if (HASH.test(id)) return { kind: 'hash', hash: id.toLowerCase() }
  if (HEIGHT.test(id)) return { kind: 'height', height: Number(id) }
  return undefined
}

/** The block list asked for one height: how a height is turned into a hash, since Explorer opens a block by its hash only. */
export const heightLookup = (height: number | undefined): PeQuery => ({
  height_min: height,
  height_max: height,
  limit: 1,
  order: 'desc',
})

/** The `min..max` text a range filter shows for a validated range. */
export function rangeText(range: NumericRange | undefined): string | undefined {
  if (!range || (range.min === undefined && range.max === undefined)) return undefined
  return `${range.min ?? ''}..${range.max ?? ''}`
}

export const dayStart = (day: string) => `${day}T00:00:00.000Z`
export const dayEnd = (day: string) => `${day}T23:59:59.999Z`

const spread = (min: string, max: string, range: NumericRange | undefined): PeQuery => ({
  ...(range?.min !== undefined ? { [min]: range.min } : {}),
  ...(range?.max !== undefined ? { [max]: range.max } : {}),
})

/**
 * Platform Explorer's blocks query for a search. The page and limit are added by the caller. A block list can't be
 * bounded by time from both sides in one call (Explorer refuses a start before the end), so `to` is handed in as a
 * `heightMax` the page resolved from it: `to` itself is only sent when `from` is absent.
 */
export function blocksQuery(s: BlocksSearch, upperHeight: number | undefined): PeQuery {
  const heightMax =
    s.height?.max !== undefined && upperHeight !== undefined
      ? Math.min(s.height.max, upperHeight)
      : (upperHeight ?? s.height?.max)
  return {
    order: s.sort === 'height' ? 'asc' : 'desc',
    ...spread('height_min', 'height_max', { min: s.height?.min, max: heightMax }),
    ...spread('epoch_index_min', 'epoch_index_max', s.epoch),
    ...spread('gas_min', 'gas_max', s.gas),
    ...spread('tx_count_min', 'tx_count_max', s.txs),
    ...(s.proposer && HASH.test(s.proposer) ? { validator: s.proposer.toUpperCase() } : {}),
    ...(s.from ? { timestamp_start: dayStart(s.from) } : {}),
    ...(s.to && !s.from ? { timestamp_end: dayEnd(s.to) } : {}),
  }
}

/** True when `to` has to be turned into a height first: both ends of a date range are set. */
export const needsUpperHeight = (s: Pick<BlocksSearch, 'from' | 'to'>): boolean =>
  s.from !== undefined && s.to !== undefined
