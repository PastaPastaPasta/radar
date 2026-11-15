import type { EChartsOption } from 'echarts'
import { describe, expect, it } from 'vitest'
import { formatNumber } from '@/lib/format'
import { formatCompactAxis, withDistinctCompactAxes } from './chart-axis'

const NARROW = [2400, 2410, 2420, 2430, 2440, 2450, 2460, 2470]

describe('compact axis labels', () => {
  it('gains precision until neighbouring ticks differ on a narrow range near 2,400', () => {
    const step = NARROW[1]! - NARROW[0]!
    const labels = NARROW.map((v) => formatCompactAxis(v, step))
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[0]).toBe('2.40K')
    expect(labels[1]).toBe('2.41K')
    expect(labels[7]).toBe('2.47K')
  })

  it('leaves a wide range on whole compact units', () => {
    expect(formatCompactAxis(2_000, 1_000)).toBe('2K')
    expect(formatCompactAxis(3_000, 1_000)).toBe('3K')
  })

  it('rewrites a compact axis whose ticks would otherwise all read 2.4K', () => {
    const values = [2400, 2410, 2420, 2430, 2440]
    const option: EChartsOption = {
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) =>
            formatNumber(v, { notation: 'compact', maximumFractionDigits: 1 }),
        },
      },
      series: [{ type: 'line', data: values }],
    }
    const before = values.map((v) =>
      formatNumber(v, { notation: 'compact', maximumFractionDigits: 1 }),
    )
    expect(before.every((label) => label === '2.4K')).toBe(true)

    const out = withDistinctCompactAxes(option)
    const fmt = (out.yAxis as { axisLabel: { formatter: (v: number) => string } }).axisLabel
      .formatter
    const labels = values.map((v) => fmt(v))
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels[0]).not.toBe(labels[1])
  })
})
