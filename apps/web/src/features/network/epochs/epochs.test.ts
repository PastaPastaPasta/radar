import { describe, expect, it } from 'vitest'
import { formatMultiplier } from './CurrentEpoch'
import { epochLengthMs } from '@/lib/epoch-length'
import { byBlocks, combined } from './queries'
import { DEFAULT_COUNT, EPOCH_REQUEST_CAP, epochChunks, resolveRange } from './RangeTable'
import { sortRows } from './state'

describe('epochChunks', () => {
  it('asks for one more epoch than it shows, so the newest shown epoch has an end', () => {
    expect(epochChunks(69, 88)).toEqual([{ first: 69, shown: 20 }])
  })

  it('splits a range wider than a request into chunks, newest first, none over the cap with its extra epoch', () => {
    const chunks = epochChunks(0, 249)
    expect(chunks.map((c) => c.shown)).toEqual([99, 99, 52])
    expect(chunks[0]).toEqual({ first: 151, shown: 99 })
    expect(chunks[2]).toEqual({ first: 0, shown: 52 })
    for (const c of chunks) expect(c.shown + 1).toBeLessThanOrEqual(EPOCH_REQUEST_CAP)
    expect(chunks.reduce((n, c) => n + c.shown, 0)).toBe(250)
  })

  it('covers a single epoch', () => {
    expect(epochChunks(5, 5)).toEqual([{ first: 5, shown: 1 }])
  })
})

describe('resolveRange', () => {
  it('shows the latest twenty when no range is asked for', () => {
    expect(resolveRange(88, undefined, undefined)).toEqual({ from: 69, to: 88, custom: false })
    expect(DEFAULT_COUNT).toBe(20)
  })

  it('starts at the first epoch on a young network', () => {
    expect(resolveRange(5, undefined, undefined)).toEqual({ from: 0, to: 5, custom: false })
  })

  it('holds the end to the current epoch and swaps a reversed range', () => {
    expect(resolveRange(88, 80, 500)).toEqual({ from: 80, to: 88, custom: true })
    expect(resolveRange(88, 86, 80)).toEqual({ from: 80, to: 86, custom: true })
  })

  it('counts back twenty from an end given alone, and runs a start given alone to the current epoch', () => {
    expect(resolveRange(88, undefined, 60)).toEqual({ from: 41, to: 60, custom: true })
    expect(resolveRange(88, 70, undefined)).toEqual({ from: 70, to: 88, custom: true })
  })
})

describe('epoch figures', () => {
  it('writes a fee multiplier from its permille', () => {
    expect(formatMultiplier(1000)).toMatch(/^1×$/)
    expect(formatMultiplier(1500)).toMatch(/^1[.,]5×$/)
  })

  it('knows the length of the two public networks and no devnet’s', () => {
    expect(epochLengthMs('mainnet')).toBe(788_400_000)
    expect(epochLengthMs('testnet')).toBe(3_600_000)
    expect(epochLengthMs('devnet-qa')).toBeUndefined()
  })

  it('ranks proposers by blocks, ties by hash', () => {
    const rows = [
      { proTxHash: 'b', blocks: 3n },
      { proTxHash: 'a', blocks: 3n },
      { proTxHash: 'c', blocks: 9n },
    ]
    expect(rows.sort(byBlocks).map((r) => r.proTxHash)).toEqual(['c', 'a', 'b'])
  })

  it('stamps several answers as one that is not itself a proof', () => {
    const stamp = (asOf: number, height: number) => ({
      source: 'sdk' as const,
      asOf,
      fetchedAt: asOf,
      proved: true,
      height,
    })
    expect(combined([stamp(1, 10), stamp(5, 12)])).toMatchObject({
      source: 'sdk',
      asOf: 5,
      proved: false,
      height: 12,
    })
  })
})

describe('sortRows', () => {
  const rows = [
    { id: 'x', n: 2n },
    { id: 'y', n: 9n },
    { id: 'z', n: 5n },
  ]
  const keys = { n: (r: (typeof rows)[number]) => r.n, id: (r: (typeof rows)[number]) => r.id }

  it('sorts ascending by a key and descending with a leading minus, without touching the input', () => {
    expect(sortRows(rows, 'n', keys).map((r) => r.id)).toEqual(['x', 'z', 'y'])
    expect(sortRows(rows, '-n', keys).map((r) => r.id)).toEqual(['y', 'z', 'x'])
    expect(sortRows(rows, '-id', keys).map((r) => r.id)).toEqual(['z', 'y', 'x'])
    expect(rows.map((r) => r.id)).toEqual(['x', 'y', 'z'])
  })

  it('keeps the order of a sort it does not know', () => {
    expect(sortRows(rows, 'nope', keys)).toEqual(rows)
  })
})
