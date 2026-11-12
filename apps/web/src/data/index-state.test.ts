import { describe, expect, it } from 'vitest'
import { INDEX_FRESH_BLOCKS, INDEX_STALE_BLOCKS, nextIndexState } from './index-state'

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

  it('does not flip while a stale index creeps back and forth inside the band', () => {
    let state = nextIndexState(undefined, 12)
    const seen = [6, 5, 4, 3, 4, 6, 3].map((behind) => (state = nextIndexState(state, behind)))
    expect(seen).toEqual(Array(7).fill('stale'))
    expect(nextIndexState(state, 2)).toBe('fresh')
  })
})
