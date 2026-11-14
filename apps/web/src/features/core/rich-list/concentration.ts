import type { HyRichRow } from '@/data/hyphen/schemas'

interface Band {
  id: string
  from: number
  to: number
  /** Share of the denominator held by the addresses ranked `from` to `to`, as a ratio. */
  share: number
  /** How many ranks in the band were present in the rows given. */
  count: number
}

const BANDS: readonly { id: string; from: number; to: number }[] = [
  { id: '1', from: 1, to: 1 },
  { id: '2–5', from: 2, to: 5 },
  { id: '6–10', from: 6, to: 10 },
  { id: '11–25', from: 11, to: 25 },
  { id: '26–50', from: 26, to: 50 },
  { id: '51–100', from: 51, to: 100 },
]

const SCALE = 10_000_000n

/** `balance` as a ratio of `total`, exact in bigint to seven digits so a duffs total past 2^53 loses nothing. */
export function shareOf(balance: bigint, total: bigint): number {
  return total > 0n ? Number((balance * SCALE) / total) / Number(SCALE) : 0
}

/** Splits the top of the rich list into the rank bands of the concentration chart, each a share of `total` duffs. */
export function concentration(rows: readonly HyRichRow[], total: bigint): Band[] {
  return BANDS.map((b) => {
    const inBand = rows.filter((r) => r.rank >= b.from && r.rank <= b.to)
    return {
      ...b,
      share: shareOf(
        inBand.reduce((sum, r) => sum + r.balance, 0n),
        total,
      ),
      count: inBand.length,
    }
  })
}
