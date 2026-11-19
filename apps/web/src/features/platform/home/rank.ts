/** PE answers each of these lists in an order of its own, so a wide page is read and ranked here. */
export const BOARD_PAGE = { limit: 50, order: 'desc' } as const

export interface Ranked<T> {
  item: T
  rank: number
  /** Another item has the same figure, so shares this rank. */
  tied: boolean
}

/** Highest figure first, with tied figures sharing a rank (1, 2, 2, 4). The order of equal figures is kept. */
export function rankDesc<T>(
  items: readonly T[],
  figure: (item: T) => bigint | number,
): Ranked<T>[] {
  const sorted = items
    .map((item, i) => ({ item, i, value: figure(item) }))
    .sort((a, b) => (a.value === b.value ? a.i - b.i : a.value > b.value ? -1 : 1))
  let rank = 0
  return sorted.map((e, i) => {
    if (i === 0 || e.value !== sorted[i - 1]!.value) rank = i + 1
    const tied =
      (i > 0 && sorted[i - 1]!.value === e.value) ||
      (i + 1 < sorted.length && sorted[i + 1]!.value === e.value)
    return { item: e.item, rank, tied }
  })
}

/**
 * One entry per key, its figures added up, in the order each key first arrived. An index that keeps two rows for
 * one contract answers it twice, each with part of its count.
 */
export function mergeByKey<T extends { key: string; value: bigint | number }>(
  rows: readonly T[],
): T[] {
  const merged = new Map<string, T>()
  for (const row of rows) {
    const seen = merged.get(row.key)
    if (!seen) merged.set(row.key, row)
    else if (typeof seen.value === 'bigint' || typeof row.value === 'bigint')
      merged.set(row.key, { ...seen, value: BigInt(seen.value) + BigInt(row.value) })
    else merged.set(row.key, { ...seen, value: seen.value + row.value })
  }
  return [...merged.values()]
}

/** A board's rows: merged by key, without the ones at zero, highest first with ties shared. */
export function boardRows<T extends { key: string; value: bigint | number }>(
  rows: readonly T[],
): Ranked<T>[] {
  return rankDesc(
    mergeByKey(rows).filter((r) => r.value > 0),
    (r) => r.value,
  )
}
