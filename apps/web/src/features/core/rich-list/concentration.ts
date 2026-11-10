import type { HyRichRow } from '@/data/hyphen/schemas'

export interface Band {
  id: string
  from: number
  to: number
  /** Share of the supply held by the addresses ranked `from` to `to`, as a ratio. */
  share: number
  /** How many ranks in the band were present in the rows given. */
  count: number
}

export const BANDS: readonly { id: string; from: number; to: number }[] = [
  { id: '1', from: 1, to: 1 },
  { id: '2–5', from: 2, to: 5 },
  { id: '6–10', from: 6, to: 10 },
  { id: '11–25', from: 11, to: 25 },
  { id: '26–50', from: 26, to: 50 },
  { id: '51–100', from: 51, to: 100 },
]

/** Splits the top of the rich list into the rank bands of the concentration chart. */
export function concentration(rows: readonly HyRichRow[]): Band[] {
  return BANDS.map((b) => {
    const inBand = rows.filter((r) => r.rank >= b.from && r.rank <= b.to)
    return {
      ...b,
      share: inBand.reduce((sum, r) => sum + r.pctSupply, 0),
      count: inBand.length,
    }
  })
}
