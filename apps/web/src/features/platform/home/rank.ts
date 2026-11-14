/** PE answers each of these lists in an order of its own, so a wide page is read and ranked here. */
export const BOARD_PAGE = { limit: 50, order: 'desc' } as const

export interface Ranked<T> {
  item: T
  rank: number
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
    return { item: e.item, rank }
  })
}
