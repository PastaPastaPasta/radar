import { describe, expect, it } from 'vitest'
import { fixtureBody } from '@/test/fixtures/load'
import { CORE_HALVING, coreRewards, perBlockSoFar, poolSoFar } from './pool'

describe('the pool so far', () => {
  it('matches Radar’s crawl for the same Core blocks', async () => {
    const doc = await fixtureBody<{ now: { pool_so_far: number; core_height: number } }>(
      'radar',
      'mainnet',
      'platform',
    )
    // Epoch 88 started at Core block 2,569,070 (the epoch.current fixture).
    expect(poolSoFar(2_569_070, doc.now.core_height)).toBe(BigInt(doc.now.pool_so_far))
  })

  it('counts each Core block at the share of its interval, across an interval boundary', () => {
    expect(coreRewards(1, 1)).toBe(112_500_000_000n)
    const first = 112_500_000_000n
    const second = first - first / 14n
    expect(coreRewards(CORE_HALVING, CORE_HALVING + 1)).toBe(first + second)
  })

  it('is nothing for an empty range, and unknown past the schedule', () => {
    expect(coreRewards(10, 9)).toBe(0n)
    expect(coreRewards(1, 2 ** 32)).toBeUndefined()
    expect(coreRewards(1, 200 * CORE_HALVING + 2)).toBeUndefined()
  })

  it('shares the pool over the blocks so far', () => {
    expect(perBlockSoFar(1_000n, 3)).toBe(333n)
    expect(perBlockSoFar(1_000n, 0)).toBeUndefined()
  })
})
