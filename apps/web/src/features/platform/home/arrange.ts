/** A board needs this many rows to stand as a full board; fewer, and it goes after the full ones. */
export const FULL_ROWS = 5

export interface BoardState {
  id: string
  /** Rows it has to rank, or undefined while its answer is not in (loading or failed). */
  rows: number | undefined
  /** Stays among the full boards whatever its rows, e.g. because it carries a control. */
  pinned?: boolean
}

export interface Placement {
  /** Full boards come first; boards with a few rows or none follow them. */
  group: 'full' | 'short'
  /** The board's place on the page. The DOM keeps the boards' own order, so none is remounted as answers arrive. */
  order: number
  /** 2: the board takes the whole row and, from the tablet width, lays its list out in two columns. */
  span: 1 | 2
  /** How many rows it shows. */
  shown: number
}

/**
 * How many rows a board in a pair shows: its top `top`, cut to its partner's so the two end on one line. A board
 * with no rows draws one row's height of "nothing", so it counts as one.
 */
export function pairRows(
  own: number | undefined,
  partner: number | undefined,
  top: number,
): number {
  const mine = Math.min(own ?? top, top)
  if (partner === undefined || own === undefined) return mine
  return Math.min(Math.max(mine, 1), Math.max(Math.min(partner, top), 1))
}

/**
 * Lays the leaderboards out so no column runs empty beside a long one. Boards with enough rows pair up, two to a
 * row on a wide screen, and end on one line; the boards with a few rows or none follow, paired the same way. In
 * each group an odd one out takes the whole row. A board whose answer is not in yet keeps a full place, so the
 * skeletons hold the page's shape. Placements are returned in the boards' own order.
 */
export function arrangeBoards<T extends BoardState>(
  boards: readonly T[],
  top: number,
): Map<string, Placement> {
  const isFull = (b: T) => b.pinned === true || b.rows === undefined || b.rows >= FULL_ROWS
  const full = boards.filter(isFull)
  const short = boards.filter((b) => !isFull(b))
  const placed = new Map<string, Placement>()
  let order = 0
  for (const [group, list] of [
    ['full', full],
    ['short', short],
  ] as const) {
    list.forEach((b, i) => {
      const alone = list.length % 2 === 1 && i === list.length - 1
      const partner = alone ? undefined : list[i % 2 === 0 ? i + 1 : i - 1]
      placed.set(b.id, {
        group,
        order: order++,
        span: alone ? 2 : 1,
        shown:
          group === 'full' && partner
            ? pairRows(b.rows, partner.rows, top)
            : Math.min(b.rows ?? top, top),
      })
    })
  }
  return new Map(boards.map((b) => [b.id, placed.get(b.id)!]))
}
