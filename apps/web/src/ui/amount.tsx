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
      className={cx('rx-amt rx-num', signed && a.sign === '+' && 'rx-amt--pos')}
      data-amount={value.toString()}
      data-usd={usdFirst ? '' : undefined}
      title={
        kind === 'credits'
          ? [
              t`${formatInt(value)} credits`,
              rate === undefined ? '' : formatFiat(value / 1000n, rate),
            ]
              .filter(Boolean)
              .join(' ')
          : undefined
      }
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

const DAY_MS = 86_400_000

/** True where `formatRelative` gives a bare date ("16 Nov") instead of an age. */
const relativeIsDate = (ms: number, now: number): boolean => {
  const delta = now - ms
  return delta >= 2 * DAY_MS || delta <= -DAY_MS
}

function absolute(ms: number, now: number, seconds: boolean): string {
  const sameDay = formatDate(ms, { time: false }) === formatDate(now, { time: false })
  return formatDate(ms, { date: !sameDay, seconds })
}

export function Time({ ms, mode = 'relative', live = false, seconds = false }: TimeProps) {
  const now = useNow(live && mode !== 'absolute')
  const at = clampSkew(ms, now)
  // Past two days the age is itself a date, and the absolute time already says it.
  const text =
    mode === 'relative'
      ? formatRelative(at, now)
      : mode === 'both' && !relativeIsDate(at, now)
        ? `${absolute(ms, now, seconds)} · ${formatRelative(at, now)}`
        : absolute(ms, now, seconds)
  return (
    <time className="rx-time" dateTime={formatIsoUtc(ms)} title={formatIsoUtc(ms)}>
      {text}
    </time>
  )
}
