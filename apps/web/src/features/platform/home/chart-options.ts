import type { EChartsOption } from 'echarts'
import { formatDate, formatInt, formatNumber } from '@/lib/format'

export const HOME_RANGES = ['24h', '3d', '1w', '1m'] as const
export type HomeRange = (typeof HOME_RANGES)[number]

export interface Series {
  name: string
  values: number[]
}

/** The label of a bucket start: the hour for a day, the day for longer spans. */
export function bucketLabel(ms: number, range: HomeRange): string {
  return range === '24h'
    ? formatDate(ms, { date: false, zone: false })
    : formatDate(ms, { time: range === '3d', year: false, zone: false })
}

const compact = (v: number): string =>
  formatNumber(v, { notation: 'compact', maximumFractionDigits: 1 })

/** Buckets over time: a line for a running total, bars for a count per bucket. */
export function timeOption(
  times: readonly number[],
  range: HomeRange,
  series: readonly Series[],
  shape: 'line' | 'bar',
  format: (v: number) => string = (v) => formatInt(Math.round(v)),
): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: shape === 'bar' ? 'shadow' : 'line' },
      valueFormatter: (v) => format(Number(v)),
    },
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: shape === 'bar',
      data: times.map((ms) => bucketLabel(ms, range)),
    },
    yAxis: {
      type: 'value',
      scale: shape === 'line',
      axisLabel: { formatter: (v: number) => compact(v) },
    },
    series: series.map((s) =>
      shape === 'bar'
        ? {
            type: 'bar',
            name: s.name,
            stack: series.length > 1 ? 'total' : undefined,
            data: s.values,
          }
        : { type: 'line', name: s.name, areaStyle: {}, data: s.values },
    ),
  }
}

/** One horizontal bar per category, the largest first. */
export function barsOption(labels: readonly string[], values: readonly number[]): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => formatInt(Number(v)),
    },
    grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => compact(v) } },
    yAxis: { type: 'category', inverse: true, data: [...labels] },
    series: [{ type: 'bar', data: [...values] }],
  }
}
