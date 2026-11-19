/** Core's subsidy interval: the Platform share of each Core block drops by 1/14 every this many blocks (mainnet and testnet). */
export const CORE_HALVING = 210_240
/** Credits each Core block adds to the epoch pool in the first interval. */
const GENESIS_CREDITS = 112_500_000_000n
const MAX_YEARS = 200

const perBlock = (year: number): bigint => {
  let d = GENESIS_CREDITS
  for (let y = 0; y < year; y++) d -= d / 14n
  return d
}

/**
 * Credits the Core blocks `from..=to` add to Platform's epoch pool, as Drive pays them and Radar's crawl counts them
 * (`core_rewards` in its rewards module). `undefined` past the schedule's 200 intervals or for a bad range.
 */
export function coreRewards(from: number, to: number, halving = CORE_HALVING): bigint | undefined {
  if (from > to || halving <= 0) return 0n
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to > 0xffff_ffff) return undefined
  const prevFrom = Math.max(0, from - 1)
  const prevTo = Math.max(0, to - 1)
  const firstYear = Math.floor(prevFrom / halving)
  const lastYear = Math.floor(prevTo / halving)
  if (lastYear >= MAX_YEARS) return undefined
  let sum = 0n
  for (let y = firstYear; y <= lastYear; y++) {
    const start = y === firstYear ? prevFrom : y * halving
    const end = y === lastYear ? to : (y + 1) * halving
    sum += BigInt(end - start) * perBlock(y)
  }
  return sum
}

/**
 * The current epoch's pool so far: the Core block rewards from the epoch's first Core block up to the ChainLocked Core
 * height Platform has reached. Fees (about 0.2 % of a pool) are not counted, as in the crawl.
 */
export function poolSoFar(
  firstCoreBlockHeight: number,
  coreChainLockedHeight: number,
): bigint | undefined {
  return coreRewards(firstCoreBlockHeight + 1, coreChainLockedHeight)
}

/** The pool so far shared over the blocks so far: what each block has earned if the epoch ended now. */
export function perBlockSoFar(pool: bigint, blocks: number): bigint | undefined {
  return blocks > 0 ? pool / BigInt(blocks) : undefined
}
