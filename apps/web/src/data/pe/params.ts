export type PeParamValue = string | number | boolean | readonly string[] | undefined

/** Paging, ordering and filters for a list endpoint, sent as query parameters under PE's own names. */
export type PeQuery = Readonly<Record<string, PeParamValue>>

/** PE timeframe names such as `1h`, `24h`, `3d`, `1w`, `1m`, `30d`. */
export type PeTimeframe = string

export const DEFAULT_PAGE_LIMIT = 25

/** Key for `/contestedResource/:value`: the resource's index values as base64 JSON. */
export function contestedResourceKey(values: readonly string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(values))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
