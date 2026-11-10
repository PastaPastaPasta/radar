import { describe, expect, it } from 'vitest'
import type { HyRichRow } from '@/data/hyphen/schemas'
import { concentration } from './concentration'

const row = (rank: number, pctSupply: number): HyRichRow => ({
  rank,
  address: `X${rank}`,
  balance: 0n,
  pctSupply,
  totalReceived: 0n,
  totalSent: 0n,
  txCount: 1,
})

describe('concentration', () => {
  it('sums each rank band and reports how many ranks it saw', () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(i + 1, 0.01))
    const bands = concentration(rows)
    expect(bands.map((b) => b.id)).toEqual(['1', '2–5', '6–10', '11–25', '26–50', '51–100'])
    expect(bands.map((b) => b.count)).toEqual([1, 4, 5, 15, 25, 50])
    expect(bands[1]?.share).toBeCloseTo(0.04)
    expect(bands.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1)
  })

  it('leaves a band short when fewer rows came back', () => {
    const bands = concentration([row(1, 0.5), row(2, 0.25)])
    expect(bands[1]?.count).toBe(1)
    expect(bands[5]?.count).toBe(0)
  })
})
