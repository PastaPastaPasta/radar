import { describe, expect, it } from 'vitest'
import {
  BLOCKS_PER_PAGE,
  MAX_DAPI_READS,
  chunksOf,
  newestPage,
  shiftDay,
  spanAbove,
  spanBelow,
  windowOf,
} from './blocks-range'

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
  it('fills a whole DAPI page within the reads the page mounts', () => {
    const chunks = chunksOf(BLOCKS_PER_PAGE)
    expect(chunks.length).toBeLessThanOrEqual(MAX_DAPI_READS)
    expect(chunks.reduce((n, c) => n + c.count, 0)).toBe(BLOCKS_PER_PAGE)
  })

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

describe('scrolling spans', () => {
  it('reads the page below down to the floor, and none past it', () => {
    expect(spanBelow(2_000_001, 0, 20)).toEqual({ top: 2_000_000, count: 20 })
    expect(spanBelow(11, 5, 20)).toEqual({ top: 10, count: 6 })
    expect(spanBelow(5, 5, 20)).toBeNull()
  })

  it('stacks full pages above the anchor, the newest one ending at the tip', () => {
    expect(spanAbove(-1, 100, 150, 20)).toEqual({ top: 120, count: 20 })
    expect(spanAbove(-3, 100, 150, 20)).toEqual({ top: 150, count: 10 })
    expect(spanAbove(-4, 100, 150, 20)).toBeNull()
    expect(spanAbove(-1, 100, 100, 20)).toBeNull()
    expect(newestPage(100, 150, 20)).toBe(-3)
    expect(newestPage(100, 100, 20)).toBe(0)
    expect(newestPage(100, 101, 20)).toBe(-1)
  })
})
