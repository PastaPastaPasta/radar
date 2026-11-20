/** Dash Core's own estimate for a superblock's time, 2.62 minutes a block (`governance/signing.cpp`). */
export const BLOCK_MS = 157_200

/** How a superblock time is estimated: the block rate to count at, and the time to count future blocks from. */
export interface Pace {
  blockMs: number
  /** ms; a future height is counted from the later of the tip's time and this (when the tip was read), so a stalled
   * tip doesn't count down to 0. */
  now: number
}

const corePace = (now = Date.now()): Pace => ({ blockMs: BLOCK_MS, now })

/** The chain's tip as DAPI gives it, which the cycle's times are counted from. */
export interface CycleTip {
  height: number
  /** ms */
  time: number
  /** ms: when DAPI's answer was read, which blocks still to come are counted from. */
  readAt: number
}

/** A past superblock's height and, when its block could be read, its time (ms). */
export interface PastSuperblock {
  height: number
  time: number | undefined
}

/** Dash Core's `getgovernanceinfo`, as far as the cycle needs it, and the tip its heights are measured against. */
export interface GovernanceCycle {
  /** What the next superblock can pay, in duffs. */
  budget: bigint
  nextSuperblock: number | null
  lastSuperblock: number | null
  /** Blocks between superblocks. */
  cycleBlocks: number | null
  /** Blocks before a superblock in which its payments are settled: Core's `superblockmaturitywindow`. */
  maturityBlocks: number | null
  tip: CycleTip | undefined
  /** The last superblocks, newest first, with their times when known. */
  past: PastSuperblock[]
  /** The block rate every time here is estimated at: the past superblocks' own, or Dash Core's 2.62 minutes. */
  blockMs: number
  /** True when `blockMs` was measured from the past superblocks. */
  rateMeasured: boolean
}

/** The one estimate every superblock time of a cycle is made with: its block rate, from when its tip was read. */
export const cyclePace = (c: GovernanceCycle): Pace => ({
  blockMs: c.blockMs,
  now: c.tip?.readAt ?? 0,
})

/** When a height is due: blocks still to come are counted from the later of the tip's time and now. */
export function heightAt(tip: CycleTip, height: number, pace: Pace = corePace()): number {
  const from = height > tip.height ? Math.max(tip.time, pace.now) : tip.time
  return from + (height - tip.height) * pace.blockMs
}

/** DAPI's tip has reached the superblock Insight calls next, so Insight's answer is behind the chain. */
export const insightBehind = (c: GovernanceCycle): boolean =>
  c.tip !== undefined && c.nextSuperblock != null && c.tip.height >= c.nextSuperblock

/** The next superblock's estimated time (ms); undefined without its height or a tip, or when Insight is behind. */
export function superblockEta(c: GovernanceCycle, pace: Pace = cyclePace(c)): number | undefined {
  if (c.nextSuperblock == null || !c.tip || insightBehind(c)) return undefined
  return heightAt(c.tip, c.nextSuperblock, pace)
}

/**
 * The block rate the chain actually ran at over the past superblocks (ms a block), from the first and last of the
 * ones whose times are known; undefined with fewer than two.
 */
export function measuredBlockMs(
  past: readonly { height: number; time: number | undefined }[],
): number | undefined {
  const known = past.filter((p): p is { height: number; time: number } => p.time !== undefined)
  if (known.length < 2) return undefined
  const newest = known.reduce((a, b) => (b.height > a.height ? b : a))
  const oldest = known.reduce((a, b) => (b.height < a.height ? b : a))
  const blocks = newest.height - oldest.height
  const ms = (newest.time - oldest.time) / blocks
  return blocks > 0 && ms > 0 ? ms : undefined
}

/**
 * The voting deadline for the next superblock: the start of its maturity window, when masternodes settle which
 * proposals it pays (`nextsuperblock − superblockmaturitywindow`). Its time is undefined without a tip.
 */
export function votingDeadline(
  c: GovernanceCycle,
  pace: Pace = cyclePace(c),
): { height: number; at: number | undefined; passed: boolean | undefined } | undefined {
  if (c.nextSuperblock == null || c.maturityBlocks == null) return undefined
  const height = c.nextSuperblock - c.maturityBlocks
  return {
    height,
    at: c.tip ? heightAt(c.tip, height, pace) : undefined,
    passed: c.tip ? c.tip.height >= height : undefined,
  }
}

/**
 * The cycle shows a superblock or voting-deadline time already past, or Insight is behind the chain: it should be read
 * again until a later superblock arrives.
 */
export function showsPastTime(c: GovernanceCycle, now: number): boolean {
  if (insightBehind(c)) return true
  const eta = superblockEta(c)
  const deadline = votingDeadline(c)
  return (
    (eta !== undefined && eta <= now) ||
    (deadline?.at !== undefined && deadline.passed === false && deadline.at <= now)
  )
}

/** The last `count` superblocks' heights, newest first, counted back a cycle at a time from the last one. */
export function pastSuperblocks(
  c: Pick<GovernanceCycle, 'lastSuperblock' | 'cycleBlocks'>,
  count: number,
): number[] {
  if (c.lastSuperblock == null || c.cycleBlocks == null || c.cycleBlocks <= 0) return []
  const out: number[] = []
  for (let h = c.lastSuperblock; h > 0 && out.length < count; h -= c.cycleBlocks) out.push(h)
  return out
}

/** What a superblock paid can't be told more finely than a block's fees, so it is shown to the nearest 0.01 DASH. */
const PAID_STEP = 1_000_000n

/**
 * What a superblock paid to proposals: its coinbase less the coinbase of the block before it, which pays the same
 * subsidy without the budget. The difference is off by the two blocks' fees, so it is rounded to 0.01 DASH, and a
 * superblock that paid nothing reads 0.
 */
export function superblockPaid(superblockCoinbase: bigint, blockBeforeCoinbase: bigint): bigint {
  const diff = superblockCoinbase - blockBeforeCoinbase
  if (diff <= 0n) return 0n
  return ((diff + PAID_STEP / 2n) / PAID_STEP) * PAID_STEP
}

/** This cycle's budget against what its proposals ask for. */
export interface CycleBudget {
  budget: bigint
  /** What the proposals that pass ask for, whether or not the budget reaches them. */
  passing: bigint
  /** What the superblock pays: the passing proposals the budget reaches. */
  funded: bigint
  /** The budget the funded proposals leave unspent. */
  left: bigint
  /** How far the passing proposals' asks exceed the budget, or 0. */
  over: bigint
}

export function cycleBudget(budget: bigint, funded: bigint, passingNotFunded: bigint): CycleBudget {
  const passing = funded + passingNotFunded
  const left = budget > funded ? budget - funded : 0n
  return { budget, passing, funded, left, over: passing > budget ? passing - budget : 0n }
}
