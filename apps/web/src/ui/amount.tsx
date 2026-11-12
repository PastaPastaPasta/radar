import { t } from '@lingui/core/macro'
import {
  clampSkew,
  formatDate,
  formatInt,
  formatIsoUtc,
  formatRelative,
  UNIT_GAP,
} from '@/lib/format'
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
  const rate = !units.testnet && duffs !== undefined ? units.usdPerDash : undefined
  const usdFirst = rate !== undefined && units.usdPrimary === true
  const dash = (
    <>
      {a.sign}
      {a.int}
      {a.frac}
      {a.dim ? <span className="rx-d2">{a.dim}</span> : null}
      {a.suffix}
      {a.unit ? (
        <span className="rx-u">
          {UNIT_GAP}
          {a.unit}
        </span>
      ) : null}
    </>
  )
  return (
    <span
      className={cx('rx-amt', 'rx-num', signed && a.sign === '+' && 'rx-amt--pos')}
      data-amount={value.toString()}
      data-usd={usdFirst ? '' : undefined}
      title={kind === 'credits' ? t`${formatInt(value)} credits` : undefined}
    >
      {usdFirst && rate !== undefined && duffs !== undefined ? (
        <>
          {formatFiat(duffs, rate, signed)}
          <span className="rx-fiat">({dash})</span>
        </>
      ) : (
        <>
          {dash}
          {fiat && rate !== undefined && duffs !== undefined ? (
            <span className="rx-fiat"> {formatFiat(duffs, rate)}</span>
          ) : null}
        </>
      )}
    </span>
  )
}

export interface TimeProps {
  ms: number
  mode?: 'relative' | 'absolute' | 'both'
  live?: boolean
  /** Adds seconds to the absolute time, for a moment that is compared with another within the same minute. */
  seconds?: boolean
}

function absolute(ms: number, now: number, seconds: boolean): string {
  const sameDay = formatDate(ms, { time: false }) === formatDate(now, { time: false })
  return formatDate(ms, { date: !sameDay, seconds })
}

export function Time({ ms, mode = 'relative', live = false, seconds = false }: TimeProps) {
  const now = useNow(live && mode !== 'absolute')
  const text =
    mode === 'absolute'
      ? absolute(ms, now, seconds)
      : mode === 'both'
        ? `${absolute(ms, now, seconds)} · ${formatRelative(clampSkew(ms, now), now)}`
        : formatRelative(clampSkew(ms, now), now)
  return (
    <time className="rx-time" dateTime={formatIsoUtc(ms)} title={formatIsoUtc(ms)}>
      {text}
    </time>
  )
}
