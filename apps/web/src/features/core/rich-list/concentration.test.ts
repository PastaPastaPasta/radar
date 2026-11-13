import { describe, expect, it } from 'vitest'
import type { HyRichRow } from '@/data/hyphen/schemas'
import { concentration, shareOf } from './concentration'

const row = (rank: number, balance: bigint): HyRichRow => ({
  rank,
  address: `X${rank}`,
  balance,
  pctSupply: 0,
  totalReceived: 0n,
  totalSent: 0n,
  txCount: 1,
})

describe('shareOf @HY-09', () => {
  it('divides a balance by the total without losing precision past 2^53', () => {
    expect(shareOf(25_000_000_000_000_000n, 100_000_000_000_000_000n)).toBeCloseTo(0.25, 7)
    expect(shareOf(1n, 0n)).toBe(0)
  })
})

describe('concentration @HY-09', () => {
  const total = 10_000n

  it('sums each rank band against the total and reports how many ranks it saw', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(i + 1, 100n))
    const bands = concentration(rows, total)
    expect(bands.map((b) => b.id)).toEqual(['1', '2–5', '6–10', '11–25', '26–50', '51–100'])
    expect(bands.map((b) => b.count)).toEqual([1, 4, 5, 15, 25, 50])
    expect(bands[1]?.share).toBeCloseTo(0.04)
    expect(bands.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1)
  })

  it('takes its denominator from the total it is given, not from the rows', () => {
    const rows = [row(1, 100n)]
    expect(concentration(rows, 1_000n)[0]?.share).toBeCloseTo(0.1)
    expect(concentration(rows, 2_000n)[0]?.share).toBeCloseTo(0.05)
  })

  it('leaves a band short when fewer rows came back', () => {
    const bands = concentration([row(1, 5n), row(2, 2n)], total)
    expect(bands[1]?.count).toBe(1)
    expect(bands[5]?.count).toBe(0)
  })
})
