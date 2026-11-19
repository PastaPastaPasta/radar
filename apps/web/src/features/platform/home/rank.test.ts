import { describe, expect, it } from 'vitest'
import { boardRows, mergeByKey, rankDesc } from './rank'

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

  it('marks every member of a tie, and nothing else', () => {
    expect(rankDesc([9, 5, 5, 3, 2, 2], (n) => n).map((r) => r.tied)).toEqual([
      false,
      true,
      true,
      false,
      true,
      true,
    ])
    expect(rankDesc([1], (n) => n)[0]!.tied).toBe(false)
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

describe('boardRows @NX-01 @PE-05', () => {
  const row = (key: string, value: number | bigint) => ({ key, value })

  it('answers a contract once when the index holds it twice, with its counts added', () => {
    // PE's mainnet index keeps two rows for each system contract; its trend list answers each row.
    const rows = mergeByKey([row('dpns', 268), row('wallet', 31), row('dpns', 0), row('wallet', 4)])
    expect(rows).toEqual([row('dpns', 268), row('wallet', 35)])
    expect(mergeByKey([row('a', 2n), row('a', 3n)])).toEqual([row('a', 5n)])
  })

  it('leaves out rows at zero', () => {
    const ranked = boardRows([row('a', 0), row('b', 8), row('c', 0n), row('d', 1)])
    expect(ranked.map((r) => r.item.key)).toEqual(['b', 'd'])
    expect(boardRows([row('a', 0), row('b', 0)])).toEqual([])
  })

  it('ranks the merged rows with ties shown as ties', () => {
    const ranked = boardRows([
      row('x', 40),
      row('y', 0),
      row('z', 40),
      row('x', 0),
      row('w', 423),
      row('v', 12),
    ])
    expect(ranked.map((r) => [r.item.key, r.rank, r.tied])).toEqual([
      ['w', 1, false],
      ['x', 2, true],
      ['z', 2, true],
      ['v', 4, false],
    ])
  })
})
