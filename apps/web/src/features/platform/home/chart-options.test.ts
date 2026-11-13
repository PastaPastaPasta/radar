import { describe, expect, it } from 'vitest'
import { barsOption, bucketLabel, timeOption } from './chart-options'

describe('chart options @PE-04', () => {
  it('labels buckets by the hour for a day and by the day for longer ranges', () => {
    const ms = Date.UTC(2026, 10, 13, 8, 30)
    expect(bucketLabel(ms, '24h')).toMatch(/\d/)
    expect(bucketLabel(ms, '1w')).not.toEqual(bucketLabel(ms, '24h'))
  })

  it('draws bars for counts and a line for a running total, one category per bucket', () => {
    const times = [1, 2, 3].map((n) => Date.UTC(2026, 10, n))
    const bars = timeOption(times, '1m', [{ name: 'a', values: [1, 2, 3] }], 'bar')
    const line = timeOption(times, '1m', [{ name: 'a', values: [1, 2, 3] }], 'line')
    expect((bars.series as { type: string }[])[0]?.type).toBe('bar')
    expect((line.series as { type: string }[])[0]?.type).toBe('line')
    expect((bars.xAxis as { data: string[] }).data).toHaveLength(3)
  })

  it('stacks two series and keeps the largest category first', () => {
    const two = timeOption(
      [1, 2],
      '24h',
      [
        { name: 'in', values: [1, 2] },
        { name: 'out', values: [0, 1] },
      ],
      'bar',
    )
    expect((two.series as { stack?: string }[]).every((s) => s.stack === 'total')).toBe(true)
    const bars = barsOption(['x', 'y'], [5, 3])
    expect((bars.yAxis as { inverse: boolean }).inverse).toBe(true)
  })
})
