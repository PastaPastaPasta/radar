import { describe, expect, it } from 'vitest'
import { dataClass, REFETCH_ON_FOCUS, staleAfterMs, type DataClass } from './stale'

const MIN = 60_000
const HOUR = 60 * MIN

describe('dataClass', () => {
  const table: [DataClass, number, number, boolean][] = [
    ['immutable', Infinity, 24 * HOUR, true],
    ['structural', 5 * MIN, HOUR, true],
    ['live', 30_000, 10 * MIN, false],
    ['tip', Infinity, 10 * MIN, false],
    ['crawl', 5 * MIN, 30 * MIN, false],
    ['index', 30_000, 10 * MIN, false],
    ['latest', 10_000, 5 * MIN, false],
    ['rate', MIN, 30 * MIN, false],
  ]

  it.each(table)('%s: staleTime, gcTime and persistence', (cls, stale, gc, persisted) => {
    const o = dataClass(cls)
    expect(o.staleTime).toBe(stale)
    expect(o.gcTime).toBe(gc)
    expect(o.meta?.persist === true).toBe(persisted)
  })

  it('polls only the rate class by default', () => {
    expect(dataClass('rate').refetchInterval).toBe(MIN)
    for (const c of [
      'immutable',
      'structural',
      'live',
      'tip',
      'crawl',
      'index',
      'latest',
    ] as const) {
      expect(dataClass(c).refetchInterval).toBeUndefined()
    }
  })

  it('returns a fresh object each call', () => {
    expect(dataClass('immutable')).not.toBe(dataClass('immutable'))
    expect(dataClass('immutable').meta).not.toBe(dataClass('immutable').meta)
  })

  it('refetches on focus for live and index only', () => {
    expect([...REFETCH_ON_FOCUS].sort()).toEqual(['index', 'live'])
  })
})

describe('staleAfterMs', () => {
  it.each<[DataClass, number]>([
    ['structural', 20 * MIN],
    ['crawl', 20 * MIN],
    ['live', 2 * MIN],
    ['index', 2 * MIN],
    ['latest', 40_000],
    ['rate', 4 * MIN],
    ['tip', 20 * MIN],
    ['immutable', Infinity],
  ])('%s turns stale at %d ms', (cls, ms) => {
    expect(staleAfterMs(cls)).toBe(ms)
  })

  it('tags every class on the query meta', () => {
    expect(dataClass('crawl').meta.dataClass).toBe('crawl')
    expect(dataClass('immutable').meta).toEqual({ persist: true, dataClass: 'immutable' })
    expect(dataClass('live').meta).toEqual({ dataClass: 'live' })
  })
})
