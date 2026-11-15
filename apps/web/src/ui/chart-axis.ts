import type { EChartsOption } from 'echarts'
import { formatNumber } from '@/lib/format'

/** How many ticks a tall axis fits. A narrower guess would still collide where the bug shows eight copies. */
const SPLITS = 8

function compact(value: number, digits: number): string {
  return formatNumber(value, {
    notation: 'compact',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Fraction digits at which every tick has its own compact label. */
function compactAxisDigits(ticks: readonly number[]): number {
  const values = ticks.filter((n) => Number.isFinite(n))
  if (values.length < 2) return 0
  for (let digits = 0; digits <= 6; digits++) {
    const labels = values.map((v) => compact(v, digits))
    if (new Set(labels).size === labels.length) return digits
  }
  return 6
}

/**
 * Compact label of `value`, gaining fraction digits until a neighbour `step` away reads differently.
 * A step of 10 near 2,400 is "2.40K" beside "2.41K", not eight copies of "2.4K".
 */
export function formatCompactAxis(value: number, step: number): string {
  const neighbour = step > 0 && Number.isFinite(step) ? value + step : value
  return compact(value, compactAxisDigits(step > 0 ? [value, neighbour] : [value]))
}

function pointValue(item: unknown): number | undefined {
  if (typeof item === 'number' && Number.isFinite(item)) return item
  if (!item || typeof item !== 'object' || !('value' in item)) return undefined
  const value = item.value
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function seriesValues(option: EChartsOption): number[] {
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  const out: number[] = []
  for (const s of series) {
    if (!s || typeof s !== 'object' || !('data' in s) || !Array.isArray(s.data)) continue
    for (const item of s.data) {
      const value = pointValue(item)
      if (value !== undefined) out.push(value)
    }
  }
  return out
}

interface Axis {
  type?: string
  axisLabel?: { formatter?: unknown }
}

function looksCompact(fmt: (v: number) => string): boolean {
  let got: string
  try {
    got = fmt(2400)
  } catch {
    return false
  }
  return [0, 1, 2, 3].some((digits) => got === compact(2400, digits))
}

function rewriteAxis(axis: Axis, ticks: readonly number[], digits: number): Axis {
  if (axis.type !== 'value') return axis
  const fmt = axis.axisLabel?.formatter
  if (typeof fmt !== 'function' || !looksCompact(fmt as (v: number) => string)) return axis
  const current = ticks.map((v) => {
    try {
      return (fmt as (v: number) => string)(v)
    } catch {
      return ''
    }
  })
  if (new Set(current).size === current.length) return axis
  return {
    ...axis,
    axisLabel: { ...axis.axisLabel, formatter: (v: number) => compact(v, digits) },
  }
}

function isAxis(value: unknown): value is Axis {
  return typeof value === 'object' && value !== null
}

function mapAxes(axis: unknown, ticks: readonly number[], digits: number): unknown {
  if (Array.isArray(axis)) {
    const items: unknown[] = Array.from(axis)
    return items.map((item) => (isAxis(item) ? rewriteAxis(item, ticks, digits) : item))
  }
  return isAxis(axis) ? rewriteAxis(axis, ticks, digits) : axis
}

/**
 * Value axes that label with compact notation pick up fraction digits until the ticks across the
 * series range read differently. Other formatters (amounts, whole counts) stay as the chart wrote them.
 */
export function withDistinctCompactAxes(option: EChartsOption): EChartsOption {
  const values = seriesValues(option)
  if (values.length < 2) return option
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (!(max > min)) return option
  const ticks = Array.from({ length: SPLITS + 1 }, (_, i) => min + ((max - min) * i) / SPLITS)
  const digits = compactAxisDigits(ticks)
  const yAxis = mapAxes(option.yAxis, ticks, digits)
  const xAxis = mapAxes(option.xAxis, ticks, digits)
  if (yAxis === option.yAxis && xAxis === option.xAxis) return option
  const next: EChartsOption = { ...option }
  if (yAxis !== option.yAxis) next.yAxis = yAxis as EChartsOption['yAxis']
  if (xAxis !== option.xAxis) next.xAxis = xAxis as EChartsOption['xAxis']
  return next
}
