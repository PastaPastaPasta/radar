/** Dash Core's block target, 2.5 minutes, which every superblock time here is estimated at. */
export const BLOCK_MS = 150_000

/** The chain's tip as DAPI gives it, which the cycle's times are counted from. */
export interface CycleTip {
  height: number
  /** ms */
  time: number
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
}

/** When a height is due, from the tip at the block target; a height already reached has its tip's time or earlier. */
export const heightAt = (tip: CycleTip, height: number): number =>
  tip.time + (height - tip.height) * BLOCK_MS

/** The next superblock's estimated time (ms), or undefined without its height or a tip. */
export function superblockEta(c: GovernanceCycle): number | undefined {
  return c.nextSuperblock == null || !c.tip ? undefined : heightAt(c.tip, c.nextSuperblock)
}

/**
 * The voting deadline for the next superblock: the start of its maturity window, when masternodes settle which
 * proposals it pays (`nextsuperblock − superblockmaturitywindow`). Its time is undefined without a tip.
 */
export function votingDeadline(
  c: GovernanceCycle,
): { height: number; at: number | undefined; passed: boolean | undefined } | undefined {
  if (c.nextSuperblock == null || c.maturityBlocks == null) return undefined
  const height = c.nextSuperblock - c.maturityBlocks
  return {
    height,
    at: c.tip ? heightAt(c.tip, height) : undefined,
    passed: c.tip ? c.tip.height >= height : undefined,
  }
}

/** The last `count` superblocks' heights, newest first, counted back a cycle at a time from the last one. */
export function pastSuperblocks(c: GovernanceCycle, count: number): number[] {
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
