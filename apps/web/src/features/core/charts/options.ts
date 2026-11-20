import type { EChartsOption } from 'echarts'
import type { HyMetrics } from '@/data/hyphen/schemas'
import { digitsFor, formatInt, formatNumber, formatSignificant } from '@/lib/format'
import { formatHashrate } from '@/lib/hashrate'
import { formatAmountText, unitLabel, type DisplayUnit } from '@/lib/units'

export { formatHashrate }

export type MetricId =
  'hashrate' | 'transactions' | 'difficulty' | 'supply' | 'utxos' | 'credit-pool'

/** The design token every Core chart draws in: the layer's line colour. A chart's title says what it measures. */
export const CHART_HUE = '--rx-core-line'

export interface Metric {
  id: MetricId
  shape: 'line' | 'bar'
  /** The value for one bucket; `prev` is the bucket before it (undefined for the first). */
  value(row: HyMetrics, prev: HyMetrics | undefined): number | undefined
  /** `resolve` is the smallest difference the reader needs to see, which an axis passes so its labels differ. */
  format(v: number, units?: ChartUnits, resolve?: number): string
}

/** The reader's unit setting, as the amount components get it from `useUnits()`. */
export interface ChartUnits {
  unit: DisplayUnit
  testnet: boolean
}

/** Past this many fraction digits on a scaled figure, the whole number reads better than "13.17501M". */
const MAX_SCALED_DIGITS = 2

function formatCompact(n: number, resolve?: number): string {
  const magnitude = Math.abs(n)
  if (resolve === undefined) {
    return magnitude > 0 && magnitude < 1
      ? formatNumber(n, { maximumSignificantDigits: 4 })
      : formatNumber(n, { notation: 'compact', maximumFractionDigits: 2 })
  }
  const scale = magnitude >= 1e3 ? 10 ** (3 * Math.floor(Math.log10(magnitude) / 3)) : 1
  const scaled = digitsFor(resolve / scale)
  if (scale > 1 && scaled <= MAX_SCALED_DIGITS) {
    return formatNumber(n, {
      notation: 'compact',
      minimumFractionDigits: scaled,
      maximumFractionDigits: scaled,
    })
  }
  return neverZero(n, digitsFor(resolve))
}

const UNIT_DUFFS: Record<DisplayUnit, number> = { DASH: 1e8, mDASH: 1e5, uDASH: 1e2, duffs: 1 }
const SCALE_SUFFIX: [number, string][] = [
  [1e9, ' B'],
  [1e6, ' M'],
  [1e3, 'k'],
]

/** `n` to `digits` places, or to two significant digits when it is nonzero and those places would print it as zero. */
const neverZero = (n: number, digits: number): string =>
  n !== 0 && Math.abs(n) < 0.5 * 10 ** -digits
    ? formatNumber(n, { maximumSignificantDigits: 2 })
    : formatNumber(n, { minimumFractionDigits: digits, maximumFractionDigits: digits })

const formatDash = (duffs: number, units?: ChartUnits, resolve?: number): string => {
  const unit = units && units.unit !== 'DASH' ? units.unit : undefined
  if (resolve === undefined) {
    return formatAmountText(BigInt(Math.round(duffs)), 'duffs', {
      compact: true,
      unit,
      testnet: units?.testnet,
    })
  }
  const per = UNIT_DUFFS[unit ?? 'DASH']
  const value = duffs / per
  const step = resolve / per
  const [scale, suffix] = SCALE_SUFFIX.find(([s]) => Math.abs(value) >= s) ?? [1, '']
  const scaled = digitsFor(step / scale)
  const [divisor, tail, digits] =
    scale > 1 && scaled <= MAX_SCALED_DIGITS ? [scale, suffix, scaled] : [1, '', digitsFor(step)]
  const shown = neverZero(value / divisor, digits)
  return `${shown}${tail}\u00a0${unitLabel(unit ?? 'DASH', units?.testnet)}`
}

export const METRICS: Record<MetricId, Metric> = {
  hashrate: {
    id: 'hashrate',
    shape: 'line',
    value: (r) => r.hashrate,
    format: (v) => formatHashrate(v),
  },
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
    format: (v) => formatSignificant(v),
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

/** Labels along one axis never need to tell apart values closer than this, since ticks are about five apart. */
const AXIS_TICKS = 5

function axisResolve(metric: Metric, data: readonly Point[]): number | undefined {
  if (data.length === 0) return undefined
  const values = data.map((p) => p.value)
  const low = metric.shape === 'bar' ? Math.min(0, ...values) : Math.min(...values)
  const range = Math.max(...values) - low
  return range > 0 ? range / AXIS_TICKS / 2 : undefined
}

function axisLabel(metric: Metric, v: number, resolve: number | undefined, units?: ChartUnits) {
  switch (metric.id) {
    case 'hashrate':
      return formatHashrate(v, resolve)
    case 'supply':
    case 'credit-pool':
      return formatDash(v, units, resolve)
    default:
      return formatCompact(v, resolve)
  }
}

export function buildOption(
  metric: Metric,
  data: readonly Point[],
  seriesName: string,
  units?: ChartUnits,
): EChartsOption {
  const resolve = axisResolve(metric, data)
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
      splitNumber: AXIS_TICKS,
      axisLabel: {
        formatter: (v: number) => axisLabel(metric, v, resolve, units),
      },
    },
    series: [
      metric.shape === 'bar'
        ? { type: 'bar', name: seriesName, data: data.map((p) => p.value) }
        : { type: 'line', name: seriesName, areaStyle: {}, data: data.map((p) => p.value) },
    ],
  }
}
