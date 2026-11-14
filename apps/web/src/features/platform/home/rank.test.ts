import { describe, expect, it } from 'vitest'
import { rankDesc } from './rank'

describe('rankDesc @NX-01 @PE-05', () => {
  it('puts the highest figure first whatever order it arrived in', () => {
    const rows = rankDesc([0, 31, 105, 271, 0], (n) => n)
    expect(rows.map((r) => r.item)).toEqual([271, 105, 31, 0, 0])
  })

  it('gives tied figures one shared rank and skips the ranks they use', () => {
    const rows = rankDesc([4, 1, 1, 1, 7], (n) => n)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 3, 3])
    expect(rankDesc([5, 5, 3], (n) => n).map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('compares credit balances as big integers, not as text', () => {
    const rows = rankDesc([334382023760n, 1022709210420n, 1013248617912n, 99n], (n) => n)
    expect(rows.map((r) => r.item)).toEqual([1022709210420n, 1013248617912n, 334382023760n, 99n])
  })

  it('keeps the arrival order of equal figures', () => {
    const rows = rankDesc(
      [
        { id: 'a', n: 1 },
        { id: 'b', n: 1 },
      ],
      (r) => r.n,
    )
    expect(rows.map((r) => r.item.id)).toEqual(['a', 'b'])
  })
})
