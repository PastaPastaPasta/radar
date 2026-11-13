import type { EChartsOption } from 'echarts'
import { formatInt, formatPercent } from '@/lib/format'
import type { WindowProgress } from './v24-math'

export interface WindowChartColors {
  signalled: string
  threshold: string
  projection: string
  met: string
}

/** The current window block by block: signalling blocks so far, the threshold, and where the pace leads. */
export function windowOption(
  progress: WindowProgress,
  size: number,
  threshold: number,
  names: { signalled: string; threshold: string; projection: string },
  colors: WindowChartColors,
): EChartsOption {
  const step = Math.max(1, Math.floor(progress.mined / 400))
  const points: [number, number][] = []
  for (let i = 0; i <= progress.mined; i += step) points.push([i, progress.cumulative[i]!])
  const last = progress.cumulative[progress.mined]!
  if (points[points.length - 1]![0] !== progress.mined) points.push([progress.mined, last])
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => formatInt(Math.round(Number(v))),
    },
    grid: { left: 8, right: 16, top: 12, bottom: 24, containLabel: true },
    xAxis: {
      type: 'value',
      min: 0,
      max: size,
      axisLabel: { formatter: (v: number) => formatInt(v) },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: size,
      axisLabel: { formatter: (v: number) => formatInt(v) },
    },
    series: [
      {
        type: 'line',
        name: names.signalled,
        symbol: 'none',
        lineStyle: { width: 2, color: colors.signalled },
        itemStyle: { color: colors.signalled },
        data: points,
      },
      {
        type: 'line',
        name: names.threshold,
        symbol: 'none',
        lineStyle: { width: 1.5, color: colors.threshold },
        itemStyle: { color: colors.threshold },
        data: [
          [0, threshold],
          [size, threshold],
        ],
      },
      {
        type: 'line',
        name: names.projection,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed', color: colors.projection },
        itemStyle: { color: colors.projection },
        data: [
          [progress.mined, last],
          [size, progress.projected],
        ],
      },
    ],
  }
}

export interface BarSlot {
  label: string
  /** The share of the window's blocks that signalled; absent for a window to come. */
  share: number | undefined
  threshold: number
  met: boolean
}

/** Window by window: the share that signalled as a bar, the threshold as a step line. */
export function windowsOption(
  slots: readonly BarSlot[],
  names: { signalled: string; threshold: string },
  colors: WindowChartColors,
): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => (v == null ? '—' : formatPercent(Number(v), 1)),
    },
    grid: { left: 8, right: 16, top: 12, bottom: 24, containLabel: true },
    xAxis: { type: 'category', data: slots.map((s) => s.label) },
    yAxis: {
      type: 'value',
      min: 0,
      max: 1,
      axisLabel: { formatter: (v: number) => `${String(Math.round(v * 100))}%` },
    },
    series: [
      {
        type: 'bar',
        name: names.signalled,
        data: slots.map((s) => ({
          value: s.share ?? null,
          itemStyle: { color: s.met ? colors.met : colors.signalled },
        })),
      },
      {
        type: 'line',
        name: names.threshold,
        symbol: 'rect',
        symbolSize: [10, 3],
        lineStyle: { width: 0 },
        itemStyle: { color: colors.threshold },
        data: slots.map((s) => s.threshold),
        z: 5,
      },
    ],
  }
}
