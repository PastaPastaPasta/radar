import { describe, expect, it, vi } from 'vitest'
import { local, mapSourced, stampOf, type Sourced } from './envelope'

const sample: Sourced<{ n: number }> = {
  source: 'pe',
  asOf: 10,
  fetchedAt: 20,
  proved: false,
  height: 7,
  data: { n: 2 },
}

describe('envelope', () => {
  it('stampOf strips the data and keeps every stamp field', () => {
    const stamp = stampOf(sample)
    expect(stamp).toEqual({ source: 'pe', asOf: 10, fetchedAt: 20, proved: false, height: 7 })
    expect('data' in stamp).toBe(false)
  })

  it('mapSourced maps data and preserves the stamp', () => {
    const mapped = mapSourced(sample, (d) => d.n * 2)
    expect(mapped).toEqual({ ...stampOf(sample), data: 4 })
  })

  it('local stamps source local with the computation time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    expect(local('x')).toEqual({
      source: 'local',
      asOf: 1_000_000,
      fetchedAt: 1_000_000,
      proved: false,
      data: 'x',
    })
    vi.useRealTimers()
  })
})
