import { clampSkew, formatDate, formatInt, formatIsoUtc, formatRelative } from '@/lib/format'
import { formatAmountParts, formatFiat, type AmountKind, type DisplayUnit } from '@/lib/units'
import { cx } from './cx'
import { useNow } from './hooks'
import { useDensity, useUnits } from './units-context'

export interface AmountProps {
  value: bigint
  kind: AmountKind
  unit?: DisplayUnit
  fiat?: boolean
  signed?: boolean
  compact?: boolean
}

export function Amount({
  value,
  kind,
  unit,
  fiat = false,
  signed = false,
  compact = false,
}: AmountProps) {
  const units = useUnits()
  const density = useDensity()
  const override = unit ?? (units.unit !== 'DASH' ? units.unit : undefined)
  const a = formatAmountParts(value, kind, {
    unit: override,
    testnet: units.testnet,
    signed,
    compact,
    density,
  })
  const duffs = kind === 'duffs' ? value : kind === 'credits' ? value / 1000n : undefined
  const showFiat = fiat && !units.testnet && units.usdPerDash !== undefined && duffs !== undefined
  return (
    <span
      className={cx('rx-amt', 'rx-num', signed && a.sign === '+' && 'rx-amt--pos')}
      data-amount={value.toString()}
      title={kind === 'credits' ? `${formatInt(value)} credits` : undefined}
    >
      {a.sign}
      {a.int}
      {a.frac}
      {a.dim ? <span className="rx-d2">{a.dim}</span> : null}
      {a.suffix}
      {a.unit ? <span className="rx-u">{a.unit}</span> : null}
      {showFiat && units.usdPerDash !== undefined && duffs !== undefined ? (
        <span className="rx-fiat"> {formatFiat(duffs, units.usdPerDash)}</span>
      ) : null}
    </span>
  )
}

export interface TimeProps {
  ms: number
  mode?: 'relative' | 'absolute' | 'both'
  live?: boolean
}

function absolute(ms: number, now: number): string {
  const sameDay = formatDate(ms, { time: false }) === formatDate(now, { time: false })
  return formatDate(ms, { date: !sameDay })
}

export function Time({ ms, mode = 'relative', live = false }: TimeProps) {
  const now = useNow(live && mode !== 'absolute')
  const text =
    mode === 'absolute'
      ? absolute(ms, now)
      : mode === 'both'
        ? `${absolute(ms, now)} · ${formatRelative(clampSkew(ms, now), now)}`
        : formatRelative(clampSkew(ms, now), now)
  return (
    <time className="rx-time" dateTime={formatIsoUtc(ms)} title={formatIsoUtc(ms)}>
      {text}
    </time>
  )
}
