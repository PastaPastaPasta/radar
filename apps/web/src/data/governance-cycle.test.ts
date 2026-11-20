import { describe, expect, it } from 'vitest'
import {
  BLOCK_MS,
  cycleBudget,
  insightBehind,
  showsPastTime,
  measuredBlockMs,
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
  tip: {
    height: 2_574_480,
    time: Date.UTC(2026, 10, 20, 8, 0),
    readAt: Date.UTC(2026, 10, 20, 8, 0),
  },
  past: [],
  blockMs: BLOCK_MS,
  rateMeasured: false,
}

const AT_TIP = { blockMs: BLOCK_MS, now: MAINNET.tip!.time }

describe('the next superblock', () => {
  it('is due at Dash Core’s 2.62 minutes a block from the tip', () => {
    expect(BLOCK_MS).toBe(157_200)
    expect(superblockEta(MAINNET, AT_TIP)).toBe(MAINNET.tip!.time + 1_000 * BLOCK_MS)
  })

  it('uses the cycle’s own rate and read time by default, so every figure shares one estimate', () => {
    const c = {
      ...MAINNET,
      blockMs: 157_600,
      tip: { ...MAINNET.tip!, readAt: MAINNET.tip!.time + 60_000 },
    }
    expect(superblockEta(c)).toBe(MAINNET.tip!.time + 60_000 + 1_000 * 157_600)
  })

  it('counts at the rate it is given', () => {
    expect(superblockEta(MAINNET, { ...AT_TIP, blockMs: 157_600 })).toBe(
      MAINNET.tip!.time + 1_000 * 157_600,
    )
  })

  it('counts blocks still to come from now when the tip has stalled, so it never reaches 0 early', () => {
    const now = MAINNET.tip!.time + 6 * 3_600_000
    expect(superblockEta(MAINNET, { blockMs: BLOCK_MS, now })).toBe(now + 1_000 * BLOCK_MS)
  })

  it('has no time once DAPI’s tip is at or past it: Insight is behind', () => {
    const behind = { ...MAINNET, tip: { ...MAINNET.tip!, height: 2_575_480 } }
    expect(insightBehind(behind)).toBe(true)
    expect(superblockEta(behind, AT_TIP)).toBeUndefined()
    expect(insightBehind(MAINNET)).toBe(false)
  })

  it('has no time without a tip or a height', () => {
    expect(superblockEta({ ...MAINNET, tip: undefined })).toBeUndefined()
    expect(superblockEta({ ...MAINNET, nextSuperblock: null })).toBeUndefined()
  })
})

describe('reading the cycle again', () => {
  const at = superblockEta(MAINNET)!

  it('is asked for while the superblock time shown has passed, and not before', () => {
    expect(showsPastTime(MAINNET, at - 1)).toBe(false)
    expect(showsPastTime(MAINNET, at)).toBe(true)
  })

  it('is asked for while the deadline shown has passed but the tip is still below it', () => {
    const before = { ...MAINNET, tip: { ...MAINNET.tip!, height: 2_573_000 } }
    const deadline = votingDeadline(before)!.at!
    expect(showsPastTime(before, deadline - 1)).toBe(false)
    expect(showsPastTime(before, deadline + 1)).toBe(true)
  })

  it('is asked for while Insight is behind the chain', () => {
    expect(showsPastTime({ ...MAINNET, tip: { ...MAINNET.tip!, height: 2_575_480 } }, 0)).toBe(true)
  })
})

describe('the voting deadline', () => {
  it('is the start of the maturity window, still ahead while the tip is below it', () => {
    const d = votingDeadline(
      { ...MAINNET, tip: { height: 2_573_000, time: 0, readAt: 0 } },
      { blockMs: BLOCK_MS, now: 0 },
    )
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

describe('the measured block rate', () => {
  // Mainnet superblocks 2,525,632, 2,542,248 and 2,558,864, as Hyphen dates them.
  const past = [
    { height: 2_558_864, time: Date.parse('2026-10-21T07:14:08Z') },
    { height: 2_542_248, time: Date.parse('2026-09-21T00:01:39Z') },
    { height: 2_525_632, time: Date.parse('2026-08-21T16:16:58Z') },
  ]

  it('is the time between the first and last known superblocks over their blocks', () => {
    const ms = measuredBlockMs(past)!
    expect(ms).toBeCloseTo((past[0]!.time - past[2]!.time) / 33_232, 6)
    expect(ms / 1000).toBeCloseTo(157.6, 1)
  })

  it('needs two known times', () => {
    expect(measuredBlockMs([past[0]!, { height: 2_542_248, time: undefined }])).toBeUndefined()
    expect(measuredBlockMs([])).toBeUndefined()
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
