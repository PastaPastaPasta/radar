import { describe, expect, it } from 'vitest'
import {
  BLOCK_MS,
  cycleBudget,
  pastSuperblocks,
  superblockEta,
  superblockPaid,
  votingDeadline,
  type GovernanceCycle,
} from './governance-cycle'

const DASH = 100_000_000n

/** Mainnet's `getgovernanceinfo` as Insight gave it on 2026-11-20, with DAPI's tip 1,000 blocks short of the superblock. */
const MAINNET: GovernanceCycle = {
  budget: 682_826_378_160n,
  nextSuperblock: 2_575_480,
  lastSuperblock: 2_558_864,
  cycleBlocks: 16_616,
  maturityBlocks: 1_662,
  tip: { height: 2_574_480, time: Date.UTC(2026, 10, 20, 8, 0) },
}

describe('the next superblock', () => {
  it('is due at the block target from the tip', () => {
    expect(superblockEta(MAINNET)).toBe(MAINNET.tip!.time + 1_000 * BLOCK_MS)
    expect(BLOCK_MS).toBe(150_000)
  })

  it('has no time without a tip or a height', () => {
    expect(superblockEta({ ...MAINNET, tip: undefined })).toBeUndefined()
    expect(superblockEta({ ...MAINNET, nextSuperblock: null })).toBeUndefined()
  })
})

describe('the voting deadline', () => {
  it('is the start of the maturity window, still ahead while the tip is below it', () => {
    const d = votingDeadline({ ...MAINNET, tip: { height: 2_573_000, time: 0 } })
    expect(d).toEqual({ height: 2_573_818, at: 818 * BLOCK_MS, passed: false })
  })

  it('has passed once the tip is in the window', () => {
    expect(votingDeadline(MAINNET)).toMatchObject({ height: 2_573_818, passed: true })
  })

  it('keeps its height without a tip, and is unknown without the window', () => {
    expect(votingDeadline({ ...MAINNET, tip: undefined })).toEqual({
      height: 2_573_818,
      at: undefined,
      passed: undefined,
    })
    expect(votingDeadline({ ...MAINNET, maturityBlocks: null })).toBeUndefined()
  })
})

describe('the last superblocks', () => {
  it('count back a cycle at a time from the last one', () => {
    expect(pastSuperblocks(MAINNET, 3)).toEqual([2_558_864, 2_542_248, 2_525_632])
  })

  it('stop at the start of the chain and need a cycle length', () => {
    expect(pastSuperblocks({ ...MAINNET, lastSuperblock: 30_000 }, 3)).toEqual([30_000, 13_384])
    expect(pastSuperblocks({ ...MAINNET, cycleBlocks: null }, 3)).toEqual([])
  })
})

describe('what a superblock paid', () => {
  it('is its coinbase less the block before’s, to the nearest 0.01 DASH', () => {
    // Mainnet superblock 2,558,864 paid six proposals 5,393 DASH; a regular coinbase then was about 1.644 DASH.
    expect(superblockPaid(539_464_378_041n, 164_412_360n)).toBe(5_393n * DASH)
  })

  it('reads 0 for a superblock that paid nothing', () => {
    expect(superblockPaid(164_400_000n, 164_412_360n)).toBe(0n)
    expect(superblockPaid(164_420_000n, 164_412_360n)).toBe(0n)
  })
})

describe('the cycle’s budget', () => {
  it('leaves what the funded proposals don’t take', () => {
    expect(cycleBudget(6_828n * DASH, 5_000n * DASH, 500n * DASH)).toEqual({
      budget: 6_828n * DASH,
      passing: 5_500n * DASH,
      funded: 5_000n * DASH,
      left: 1_828n * DASH,
      over: 0n,
    })
  })

  it('says by how much passing proposals ask for more than the budget', () => {
    expect(cycleBudget(6_828n * DASH, 6_800n * DASH, 1_000n * DASH)).toMatchObject({
      passing: 7_800n * DASH,
      left: 28n * DASH,
      over: 972n * DASH,
    })
  })
})
