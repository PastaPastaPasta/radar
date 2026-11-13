import { describe, expect, it } from 'vitest'
import { blocksIn, compareEpochs, payoutIn, rankIn, spreadOf, withdrawalOf, type Finalized } from './platform-math'

const A = 'aa'.repeat(32)
const B = 'bb'.repeat(32)
const C = 'cc'.repeat(32)

const info = (over: Partial<Finalized> = {}): Finalized => ({
  index: 80,
  totalBlocks: 10,
  coreBlockRewards: 100n,
  totalProcessingFees: 7n,
  totalDistributedStorageFees: 0n,
  blockProposers: new Map([
    [A, 3n],
    [B, 3n],
    [C, 4n],
  ]),
  ...over,
})

describe('payoutIn', () => {
  it('pays pool × blocks / total rounded down, in identifier order, the last proposer taking the remainder', () => {
    const i = info()
    expect(payoutIn(i, A)).toBe(32n)
    expect(payoutIn(i, B)).toBe(32n)
    expect(payoutIn(i, C)).toBe(43n)
    expect(payoutIn(i, A) + payoutIn(i, B) + payoutIn(i, C)).toBe(107n)
  })

  it('pays nothing to an evonode that proposed no block', () => {
    expect(payoutIn(info(), 'dd'.repeat(32))).toBe(0n)
  })

  it('accepts an upper-case ProTx', () => {
    expect(blocksIn(info(), A.toUpperCase())).toBe(3n)
  })
})

describe('rankIn', () => {
  it('ranks by blocks and shares a rank between equal counts', () => {
    expect(rankIn(info(), C)).toEqual({ rank: 1, of: 3 })
    expect(rankIn(info(), A)).toEqual({ rank: 2, of: 3 })
    expect(rankIn(info(), B)).toEqual({ rank: 2, of: 3 })
    expect(rankIn(info(), 'dd'.repeat(32))).toBeNull()
  })
})

describe('compareEpochs', () => {
  it('says match or differ per epoch, newest first, and null where Radar has no row', () => {
    const rows = compareEpochs(
      [info({ index: 79 }), info({ index: 80 }), info({ index: 81 })],
      [
        { epoch: 80, blocks: 3, credits: 32n },
        { epoch: 81, blocks: 3, credits: 31n },
      ],
      A,
    )
    expect(rows.map((r) => [r.epoch, r.matches])).toEqual([
      [81, false],
      [80, true],
      [79, null],
    ])
  })
})

describe('spreadOf', () => {
  it('gives the 10th, 50th and 90th percentile', () => {
    const v = Array.from({ length: 11 }, (_, i) => BigInt(i * 10))
    expect(spreadOf(v)).toEqual({ p10: 10n, p50: 50n, p90: 90n })
    expect(spreadOf([])).toBeNull()
  })
})

describe('withdrawalOf', () => {
  it('reads amount and status from the document data', () => {
    const w = withdrawalOf({
      id: 'x',
      createdAt: 1,
      updatedAt: null,
      data: { amount: 5_000_000, status: 3 },
    })
    expect(w).toMatchObject({ amount: 5_000_000n, status: 'complete', createdAt: 1 })
    expect(withdrawalOf({ id: 'y', createdAt: null, updatedAt: null, data: {} }).status).toBe('unknown')
  })
})
