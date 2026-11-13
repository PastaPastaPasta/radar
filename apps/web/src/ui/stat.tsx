import { t } from '@lingui/core/macro'
import { Children, cloneElement, isValidElement, useId, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { formatNumber, MINUS, UNIT_GAP } from '@/lib/format'
import { cx, cssVars, layerAttr } from './cx'
import { useChanged } from './hooks'
import { SourceLine, Skeleton } from './states'
import { sourceKey, useCoveredSource } from './source-scope'
import type { Layer, Tone } from './types'

export interface MeterProps {
  value: number
  max: number
  label: ReactNode
  format?: (v: number) => string
  thresholds?: { at: number; tone: Tone }[]
  marker?: { at: number; label: ReactNode }
}

const METER_TONE: Record<Tone, string | undefined> = {
  neutral: undefined,
  info: undefined,
  success: 'good',
  warning: 'warn',
  danger: 'bad',
}

function pct(value: number, max: number): number {
  return max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
}

function toneAt(value: number, thresholds: MeterProps['thresholds']): string | undefined {
  const hit = [...(thresholds ?? [])]
    .sort((a, b) => a.at - b.at)
    .filter((t) => value >= t.at)
    .pop()
  return hit ? METER_TONE[hit.tone] : undefined
}

export function MeterBar({
  value,
  max,
  labelledBy,
  valueText,
  thresholds,
  marker,
  large,
  className,
}: {
  value: number
  max: number
  labelledBy: string
  valueText: string
  thresholds?: MeterProps['thresholds']
  marker?: { at: number; label: ReactNode }
  large?: boolean
  className?: string
}) {
  const tone = toneAt(value, thresholds)
  return (
    <div
      className={cx('rx-meter', tone && `rx-meter--${tone}`, large && 'rx-meter--lg', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-labelledby={labelledBy}
    >
      <i style={{ width: `${pct(value, max)}%` }} />
      {marker ? (
        <b className="rx-meter__mark" style={{ left: `${pct(marker.at, max)}%` }}>
          <span className="rx-meter__mlabel">{marker.label}</span>
        </b>
      ) : null}
    </div>
  )
}

export function Meter({ value, max, label, format, thresholds, marker }: MeterProps) {
  const id = useId()
  const text = format ? format(value) : formatNumber(value)
  return (
    <div className={cx('rx-meterbox', marker && 'rx-meterbox--marked')}>
      <div className="rx-meterbox__head">
        <span id={id}>{label}</span>
        <span className="rx-num">{text}</span>
      </div>
      <MeterBar
        value={value}
        max={max}
        labelledBy={id}
        valueText={text}
        thresholds={thresholds}
        marker={marker}
      />
    </div>
  )
}

export interface SparklineProps {
  values: number[]
  label: string
  layer?: Layer
  width?: number
  height?: number
  highlightLast?: boolean
}

const SPARK_PAD = 4

export function sparkPoints(values: number[], height: number): [number, number][] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const inner = height - SPARK_PAD * 2
  return values.map((v, i) => [
    values.length > 1 ? (i / (values.length - 1)) * 100 : 100,
    SPARK_PAD + inner - ((v - min) / span) * inner,
  ])
}

export function Sparkline({
  values,
  label,
  layer,
  width,
  height = 36,
  highlightLast = false,
}: SparklineProps) {
  const summaryId = useId()
  if (values.length === 0) return null
  const pts = sparkPoints(values, height)
  const line = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
  const last = pts[pts.length - 1] ?? [100, height / 2]
  const area = `${line} L100 ${height} L0 ${height} Z`
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return (
    <span
      className="rx-sparkbox"
      data-layer={layerAttr(layer)}
      role="img"
      aria-label={label}
      aria-describedby={summaryId}
      style={{ width: width ?? '100%', height }}
    >
      <svg
        className="rx-spark"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="a" d={area} />
        <path className="l" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      {highlightLast ? (
        <i
          className="rx-spark__dot"
          style={cssVars({ '--k': last[0] / 100, '--y': `${last[1]}px` })}
        />
      ) : null}
      <span id={summaryId} className="dh-sr">
        {t`${values.length} points, from ${formatNumber(values[0] ?? 0)} to ${formatNumber(values[values.length - 1] ?? 0)}, low ${formatNumber(lo)}, high ${formatNumber(hi)}`}
      </span>
    </span>
  )
}

export interface StatProps {
  label: ReactNode
  value: ReactNode
  unit?: ReactNode
  note?: ReactNode
  delta?: { value: number; period: ReactNode; goodWhen?: 'up' | 'down' | 'neither' }
  spark?: number[]
  meter?: { value: number; max: number }
  href?: string
  source?: SourceStamp
  loading?: boolean
  size?: 'md' | 'lg'
  layer?: Layer
  tone?: 'neutral' | 'good' | 'warn' | 'bad'
}

function Delta({ delta }: { delta: NonNullable<StatProps['delta']> }) {
  const { value, period, goodWhen = 'neither' } = delta
  const up = value > 0
  const down = value < 0
  const judged = goodWhen !== 'neither' && (up || down)
  const good = judged && (goodWhen === 'up' ? up : down)
  const sign = up ? '+' : down ? MINUS : ''
  return (
    <span className={cx('rx-delta', judged && (good ? 'rx-delta--good' : 'rx-delta--bad'))}>
      {judged ? <span aria-hidden="true">{up ? '↑' : '↓'} </span> : null}
      {sign}
      {formatNumber(Math.abs(value))} {period}
      {judged ? <span className="dh-sr">{good ? ', good' : ', worse'}</span> : null}
    </span>
  )
}

function Rolled({ children }: { children: ReactNode }) {
  const key = useChanged(
    typeof children === 'string' || typeof children === 'number' ? children : null,
  )
  if (typeof children !== 'string' && typeof children !== 'number') return <>{children}</>
  return (
    <span key={key} className={cx('rx-tick', key > 0 && 'is-new')}>
      {children}
    </span>
  )
}

export function Stat({
  label,
  value,
  unit,
  note,
  delta,
  spark,
  meter,
  href,
  source,
  loading,
  size = 'md',
  layer,
  tone = 'neutral',
}: StatProps) {
  const labelId = useId()
  const covered = useCoveredSource(source)
  const Tag = href ? 'a' : 'div'
  const body = (
    <>
      <span className="rx-stat__label" id={labelId}>
        {label}
        {source && !covered ? (
          <SourceLine stamp={href ? { ...source, proof: undefined } : source} compact />
        ) : null}
      </span>
      {loading ? (
        <Skeleton shape="stat" />
      ) : (
        <>
          <span className="rx-stat__value">
            <Rolled>{value}</Rolled>
            {unit ? (
              <small>
                {UNIT_GAP}
                {unit}
              </small>
            ) : null}
          </span>
          {note || delta ? (
            <span className="rx-stat__note">
              {note}
              {note && delta ? ' · ' : null}
              {delta ? <Delta delta={delta} /> : null}
            </span>
          ) : null}
          {meter ? (
            <MeterBar
              className="rx-stat__meter"
              value={meter.value}
              max={meter.max}
              labelledBy={labelId}
              valueText={t`${formatNumber(meter.value)} of ${formatNumber(meter.max)}`}
            />
          ) : null}
          {spark && spark.length > 1 ? (
            <Sparkline values={spark} label={t`Trend`} layer={layer} height={28} />
          ) : null}
        </>
      )}
    </>
  )
  return (
    <Tag
      className={cx(
        'rx-stat',
        size === 'lg' && 'rx-stat--big',
        tone !== 'neutral' && `rx-stat--${tone}`,
      )}
      data-layer={layerAttr(layer)}
      data-tone={tone}
      aria-busy={loading ? true : undefined}
      {...(href ? { href } : {})}
    >
      {body}
    </Tag>
  )
}

/** A figure read this much earlier than its group's first shows its own age instead of borrowing the group's. */
const SAME_READ_MS = 30_000

/**
 * A row of stats. When several share a source, only the first carries its badge: the rest are read as part of the same
 * group, so a card of four figures from two sources shows two badges, not four. A figure that is clearly older than the
 * first of its source keeps its own badge, so a figure that stopped refreshing can't hide behind one that is current.
 */
export function Stats({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  const seen = new Map<string, number>()
  const stats = Children.map(children, (child) => {
    if (!isValidElement<StatProps>(child) || child.type !== Stat || !child.props.source)
      return child
    const { source } = child.props
    const key = sourceKey(source)
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, source.asOf)
      return child
    }
    return first - source.asOf > SAME_READ_MS ? child : cloneElement(child, { source: undefined })
  })
  return (
    <div className="rx-stats" {...rest}>
      {stats}
    </div>
  )
}
