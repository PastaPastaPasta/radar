import { describe, expect, it } from 'vitest'
import { BLOCKS_PER_PAGE, chunksOf, shiftDay, windowOf } from './blocks-range'

describe('windowOf', () => {
  it('starts at the newest block and pages back', () => {
    const w = windowOf(1000, 0, undefined)
    expect(w).toEqual({
      top: 1000,
      count: BLOCKS_PER_PAGE,
      newer: null,
      older: { from: 980 },
    })
  })

  it('links back to the newest page once the cursor is within a page of it', () => {
    expect(windowOf(1000, 0, 990)?.newer).toEqual({})
    expect(windowOf(1000, 0, 900)?.newer).toEqual({ from: 920 })
  })

  it('stops at the floor with a short last page', () => {
    const w = windowOf(1000, 990, 995)
    expect(w).toEqual({ top: 995, count: 6, newer: {}, older: null })
  })

  it('clamps a cursor outside the range', () => {
    expect(windowOf(1000, 0, 5000)?.top).toBe(1000)
    expect(windowOf(1000, 500, 3)?.top).toBe(500)
  })

  it('has no page for an empty range', () => {
    expect(windowOf(10, 11, undefined)).toBeNull()
  })
})

describe('shiftDay', () => {
  it('moves across month and year ends', () => {
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('chunksOf @IN-02', () => {
  it('reads a full page as four rows and then eight at a time', () => {
    expect(chunksOf(20)).toEqual([
      { offset: 0, count: 4 },
      { offset: 4, count: 8 },
      { offset: 12, count: 8 },
    ])
  })

  it('reads a short page in as many steps as it needs, and an empty one in none', () => {
    expect(chunksOf(3)).toEqual([{ offset: 0, count: 3 }])
    expect(chunksOf(7)).toEqual([
      { offset: 0, count: 4 },
      { offset: 4, count: 3 },
    ])
    expect(chunksOf(0)).toEqual([])
  })
})
