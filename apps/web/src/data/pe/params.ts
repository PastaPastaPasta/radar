export type PeParamValue = string | number | boolean | readonly string[] | undefined

/** Paging, ordering and filters for a list endpoint, sent as query parameters under PE's own names. */
export type PeQuery = Readonly<Record<string, PeParamValue>>

/** PE timeframe names such as `1h`, `24h`, `3d`, `1w`, `1m`, `30d`. */
export type PeTimeframe = string

export const DEFAULT_PAGE_LIMIT = 25

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** How far back each named range reaches and how many buckets it is cut into. */
const RANGE_SPECS: Readonly<Record<string, { span: number; buckets: number }>> = {
  '1h': { span: HOUR, buckets: 12 },
  '24h': { span: DAY, buckets: 24 },
  '3d': { span: 3 * DAY, buckets: 12 },
  '1w': { span: 7 * DAY, buckets: 7 },
  '1m': { span: 30 * DAY, buckets: 30 },
  '30d': { span: 30 * DAY, buckets: 30 },
}

const GRID = 5 * 60_000

/** A range's window alone, for the reads that total it instead of cutting it into buckets. */
export function rangeWindow(timeframe: PeTimeframe, now: number = Date.now()): PeQuery {
  const spec = RANGE_SPECS[timeframe]
  if (!spec) return { timeframe }
  const end = Math.floor(now / GRID) * GRID
  return {
    timestamp_start: new Date(end - spec.span).toISOString(),
    timestamp_end: new Date(end).toISOString(),
  }
}

/**
 * PE ignores `timeframe` on its history and stats reads (every name answers with the last hour in 5-minute
 * buckets); it honours a time window and a bucket count. The window ends on a 5-minute grid, so the shield and
 * unshield reads, made a moment apart, cut identical buckets.
 */
export function rangeQuery(
  timeframe: PeTimeframe,
  now: number = Date.now(),
  intervals?: number,
): PeQuery {
  const spec = RANGE_SPECS[timeframe]
  if (!spec) return { timeframe }
  return { ...rangeWindow(timeframe, now), intervalsCount: intervals ?? spec.buckets }
}

/** Key for `/contestedResource/:value`: the resource's index values as base64 JSON. */
export function contestedResourceKey(values: readonly string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(values))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
