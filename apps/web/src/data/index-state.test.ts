import { afterEach, describe, expect, it } from 'vitest'
import {
  INDEX_FRESH_BLOCKS,
  INDEX_STALE_BLOCKS,
  nextIndexState,
  rememberedIndexState,
  resetIndexState,
  settleIndexState,
} from './index-state'

afterEach(resetIndexState)

describe('nextIndexState', () => {
  it('is stale past six blocks and fresh at two or fewer', () => {
    expect(INDEX_STALE_BLOCKS).toBe(6)
    expect(INDEX_FRESH_BLOCKS).toBe(2)
    expect(nextIndexState(undefined, 7)).toBe('stale')
    expect(nextIndexState('fresh', 7)).toBe('stale')
    expect(nextIndexState(undefined, 0)).toBe('fresh')
    expect(nextIndexState('stale', 2)).toBe('fresh')
  })

  it('keeps the earlier answer between three and six blocks behind', () => {
    for (const behind of [3, 4, 5, 6]) {
      expect(nextIndexState('fresh', behind)).toBe('fresh')
      expect(nextIndexState('stale', behind)).toBe('stale')
    }
    expect(nextIndexState(undefined, 4)).toBe('fresh')
  })
})

describe('settleIndexState', () => {
  it('does not flip while a stale index creeps back and forth inside the band', () => {
    const seen = [12, 6, 5, 4, 3, 4, 6, 3].map((behind) => settleIndexState('testnet', behind))
    expect(seen).toEqual(Array(8).fill('stale'))
    expect(settleIndexState('testnet', 2)).toBe('fresh')
    expect([3, 5, 6].map((behind) => settleIndexState('testnet', behind))).toEqual(
      Array(3).fill('fresh'),
    )
    expect(settleIndexState('testnet', 7)).toBe('stale')
  })

  it('remembers each network on its own', () => {
    settleIndexState('testnet', 100)
    settleIndexState('mainnet', 0)
    expect(rememberedIndexState('testnet')).toBe('stale')
    expect(rememberedIndexState('mainnet')).toBe('fresh')
    expect(rememberedIndexState('devnet-ruby')).toBeUndefined()
  })
})
