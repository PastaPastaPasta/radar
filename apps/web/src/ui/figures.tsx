import type { EChartsOption } from 'echarts'
import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { SourceLine, Skeleton } from './states'
import type { AmountUnit, CoreTxType, Layer, Tone, TransitionType } from './types'

export interface StatProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  delta?: { value: number; period: ReactNode; goodWhen?: 'up' | 'down' | 'neither' }
  spark?: number[]
  meter?: { value: number; max: number }
  href?: string
  source?: SourceStamp
  loading?: boolean
  size?: 'md' | 'lg'
  layer?: Layer
}

export function Stat({
  label,
  value,
  unit,
  delta,
  href,
  source,
  loading,
  size = 'md',
  layer,
}: StatProps) {
  const figure = loading ? (
    <Skeleton shape="stat" />
  ) : (
    <>
      <span>{value}</span>
      {unit ? <span>{unit}</span> : null}
    </>
  )
  return (
    <div data-layer={layer} data-size={size}>
      <span>{label}</span>
      {href ? <a href={href}>{figure}</a> : <div>{figure}</div>}
      {delta ? (
        <span>
          {delta.value > 0 ? '+' : ''}
          {delta.value} {delta.period}
        </span>
      ) : null}
      {source ? <SourceLine stamp={source} compact /> : null}
    </div>
  )
}

export interface AmountProps {
  value: bigint
  kind: 'duffs' | 'credits' | { token: { decimals: number; symbol?: string } }
  unit?: AmountUnit
  fiat?: boolean
  signed?: boolean
  compact?: boolean
}

export function Amount({ value, kind, unit, signed }: AmountProps) {
  const suffix = typeof kind === 'string' ? (unit ?? kind) : (kind.token.symbol ?? '')
  return (
    <span data-amount={value.toString()}>
      {signed && value > 0n ? '+' : ''}
      {value.toString()} {suffix}
    </span>
  )
}

export interface TimeProps {
  ms: number
  mode?: 'relative' | 'absolute' | 'both'
  live?: boolean
}

export function Time({ ms }: TimeProps) {
  const iso = new Date(ms).toISOString()
  return <time dateTime={iso}>{iso}</time>
}

export interface BadgeProps {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md'
}

export function Badge({ tone = 'neutral', icon, children, size = 'md' }: BadgeProps) {
  return (
    <span data-tone={tone} data-size={size}>
      {icon}
      {children}
    </span>
  )
}

export interface TypeBadgeProps {
  type: CoreTxType | TransitionType
}

export function TypeBadge({ type }: TypeBadgeProps) {
  return <span data-type={type}>{type}</span>
}

export interface SparklineProps {
  values: number[]
  label: string
  layer?: Layer
  width?: number
  height?: number
  highlightLast?: boolean
}

export function Sparkline({ values, label, layer, width = 80, height = 24 }: SparklineProps) {
  const max = Math.max(1, ...values)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ')
  return (
    <svg role="img" aria-label={label} data-layer={layer} width={width} height={height}>
      <polyline points={points} fill="none" stroke="currentColor" />
    </svg>
  )
}

export interface MeterProps {
  value: number
  max: number
  label: ReactNode
  format?: (v: number) => string
  thresholds?: { at: number; tone: Tone }[]
  marker?: { at: number; label: ReactNode }
}

export function Meter({ value, max, label, format }: MeterProps) {
  return (
    <div>
      <span>{label}</span>
      <meter value={value} max={max} />
      <span>{format ? format(value) : value}</span>
    </div>
  )
}

export interface ChartProps {
  option: EChartsOption
  height: number
  label: string
  table: { columns: string[]; rows: (string | number)[][] }
  group?: string
  loading?: boolean
}

export function Chart({ height, label, table, group, loading }: ChartProps) {
  return (
    <figure data-chart-group={group} style={{ minHeight: height }}>
      <figcaption>{label}</figcaption>
      {loading ? (
        <Skeleton shape="chart" height={height} />
      ) : (
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
