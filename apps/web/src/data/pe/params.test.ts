import { describe, expect, it } from 'vitest'
import { rangeQuery, rangeWindow } from './params'

const NOW = Date.UTC(2026, 10, 14, 22, 33, 41)
const HOUR = 3_600_000

function windowOf(range: string) {
  const q = rangeQuery(range, NOW)
  return {
    hours: (Date.parse(String(q.timestamp_end)) - Date.parse(String(q.timestamp_start))) / HOUR,
    buckets: q.intervalsCount,
    end: q.timestamp_end,
    timeframe: q.timeframe,
  }
}

describe('rangeQuery @PE-04', () => {
  it('sends a time window and a bucket count, never the timeframe PE ignores', () => {
    for (const range of ['24h', '3d', '1w', '1m']) {
      expect(windowOf(range).timeframe).toBeUndefined()
    }
  })

  it('cuts each range into buckets a chart can read', () => {
    expect(windowOf('24h')).toMatchObject({ hours: 24, buckets: 24 })
    expect(windowOf('3d')).toMatchObject({ hours: 72, buckets: 12 })
    expect(windowOf('1w')).toMatchObject({ hours: 168, buckets: 7 })
    expect(windowOf('1m')).toMatchObject({ hours: 720, buckets: 30 })
  })

  it('ends every window on the same 5-minute mark, so reads made a moment apart agree', () => {
    expect(rangeQuery('1w', NOW).timestamp_end).toBe('2026-11-14T22:30:00.000Z')
    expect(rangeQuery('1w', NOW + 60_000).timestamp_end).toBe('2026-11-14T22:30:00.000Z')
    expect(rangeQuery('1w', NOW).timestamp_start).toBe('2026-11-07T22:30:00.000Z')
  })

  it('lets a caller name the bucket count', () => {
    expect(rangeQuery('24h', NOW, 6).intervalsCount).toBe(6)
  })

  it('passes a name it does not know through as it was given', () => {
    expect(rangeQuery('5y', NOW)).toEqual({ timeframe: '5y' })
  })

  it('gives a window alone for the reads that total a range', () => {
    expect(rangeWindow('3d', NOW)).toEqual({
      timestamp_start: '2026-11-11T22:30:00.000Z',
      timestamp_end: '2026-11-14T22:30:00.000Z',
    })
  })
})
