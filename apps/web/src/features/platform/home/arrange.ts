/** A board needs this many rows to stand as a full board; fewer, and it joins the short row. */
export const FULL_ROWS = 5

export interface BoardState {
  id: string
  /** Rows it has to rank, or undefined while its answer is not in (loading or failed). */
  rows: number | undefined
  /** Stays a full board whatever its rows, e.g. because it carries a control. */
  pinned?: boolean
}

export interface Arrangement<T> {
  /** Full boards, two to a row from the wide breakpoint. */
  full: T[]
  /** The last full board when their number is odd: it takes the whole row and lays its list out in two columns. */
  wide: T | undefined
  /** Boards with a few rows or none, side by side in one compact row under the full ones. */
  short: T[]
}

/**
 * Lays the leaderboards out so no column runs empty beside a long one: boards with enough rows pair up, an odd one
 * out spans the row, and the ones with a few rows or none share a short row. A board whose answer is not in yet
 * keeps a full place, so the skeletons hold the page's shape.
 */
export function arrangeBoards<T extends BoardState>(boards: readonly T[]): Arrangement<T> {
  const full: T[] = []
  const short: T[] = []
  for (const b of boards) {
    if (b.pinned || b.rows === undefined || b.rows >= FULL_ROWS) full.push(b)
    else short.push(b)
  }
  const wide = full.length % 2 === 1 ? full.pop() : undefined
  return { full, wide, short }
}

/** How many rows a full board shows: the top `top`, cut to its partner's count so the two end on one line. */
export function pairRows(own: number, partner: number | undefined, top: number): number {
  const mine = Math.min(own, top)
  if (partner === undefined) return mine
  return Math.min(mine, Math.max(Math.min(partner, top), FULL_ROWS))
}
