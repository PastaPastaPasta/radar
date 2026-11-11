import type { EChartsOption } from 'echarts'
import type { HyMetrics } from '@/data/hyphen/schemas'
import { formatInt, formatNumber } from '@/lib/format'
import { formatAmountText, type DisplayUnit } from '@/lib/units'

export type MetricId =
  'hashrate' | 'transactions' | 'difficulty' | 'supply' | 'utxos' | 'credit-pool'

export interface Metric {
  id: MetricId
  shape: 'line' | 'bar'
  /** The value for one bucket; `prev` is the bucket before it (undefined for the first). */
  value(row: HyMetrics, prev: HyMetrics | undefined): number | undefined
  format(v: number, units?: ChartUnits): string
}

/** The reader's unit setting, as the amount components get it from `useUnits()`. */
export interface ChartUnits {
  unit: DisplayUnit
  testnet: boolean
}

const HASH_UNITS: [number, string][] = [
  [1e18, 'EH/s'],
  [1e15, 'PH/s'],
  [1e12, 'TH/s'],
  [1e9, 'GH/s'],
  [1e6, 'MH/s'],
  [1e3, 'kH/s'],
]

export function formatHashrate(hps: number): string {
  const [scale, unit] = HASH_UNITS.find(([s]) => hps >= s) ?? [1, 'H/s']
  return `${formatNumber(hps / scale, { maximumFractionDigits: 2 })} ${unit}`
}

export function formatCompact(n: number): string {
  return formatNumber(n, { notation: 'compact', maximumFractionDigits: 2 })
}

const formatDash = (duffs: number, units?: ChartUnits): string =>
  formatAmountText(BigInt(Math.round(duffs)), 'duffs', {
    compact: true,
    unit: units && units.unit !== 'DASH' ? units.unit : undefined,
    testnet: units?.testnet,
  })

export const METRICS: Record<MetricId, Metric> = {
  hashrate: { id: 'hashrate', shape: 'line', value: (r) => r.hashrate, format: formatHashrate },
  transactions: {
    id: 'transactions',
    shape: 'bar',
    value: (r, prev) => (prev ? r.txCount - prev.txCount : undefined),
    format: (v) => formatInt(Math.round(v)),
  },
  difficulty: {
    id: 'difficulty',
    shape: 'line',
    value: (r) => r.difficulty,
    format: formatCompact,
  },
  supply: {
    id: 'supply',
    shape: 'line',
    value: (r) => Number(r.circulatingSupply),
    format: formatDash,
  },
  utxos: {
    id: 'utxos',
    shape: 'line',
    value: (r) => r.utxosSpendable,
    format: (v) => formatInt(Math.round(v)),
  },
  'credit-pool': {
    id: 'credit-pool',
    shape: 'line',
    value: (r) => (r.creditPoolBalance == null ? undefined : Number(r.creditPoolBalance)),
    format: formatDash,
  },
}

export interface Point {
  height: number
  value: number
}

/** One point per bucket, skipping buckets the metric cannot be worked out for. */
export function points(metric: Metric, rows: readonly HyMetrics[]): Point[] {
  const out: Point[] = []
  rows.forEach((row, i) => {
    const value = metric.value(row, rows[i - 1])
    if (value !== undefined && Number.isFinite(value)) out.push({ height: row.height, value })
  })
  return out
}

export function buildOption(
  metric: Metric,
  data: readonly Point[],
  seriesName: string,
  units?: ChartUnits,
): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: metric.shape === 'bar' ? 'shadow' : 'line' },
      valueFormatter: (v) => metric.format(Number(v), units),
    },
    grid: { left: 8, right: 12, top: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: metric.shape === 'bar',
      data: data.map((p) => formatInt(p.height)),
    },
    yAxis: {
      type: 'value',
      scale: metric.shape === 'line',
      axisLabel: {
        formatter: (v: number) =>
          metric.id === 'hashrate'
            ? formatHashrate(v)
            : metric.id === 'supply' || metric.id === 'credit-pool'
              ? formatDash(v, units)
              : formatCompact(v),
      },
    },
    series: [
      metric.shape === 'bar'
        ? { type: 'bar', name: seriesName, data: data.map((p) => p.value) }
        : { type: 'line', name: seriesName, areaStyle: {}, data: data.map((p) => p.value) },
    ],
  }
}
