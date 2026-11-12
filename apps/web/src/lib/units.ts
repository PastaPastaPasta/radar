import { MINUS, formatNumber, getFormatLocale } from './format'

export type DisplayUnit = 'DASH' | 'mDASH' | 'uDASH' | 'duffs'

export const DUFFS_PER_DASH = 100_000_000n
export const CREDITS_PER_DASH = 100_000_000_000n

/** Decimal places between a base unit (duffs or credits) and each display unit. */
const SCALE: Record<'duffs' | 'credits', Record<DisplayUnit, number>> = {
  duffs: { DASH: 8, mDASH: 5, uDASH: 2, duffs: 0 },
  credits: { DASH: 11, mDASH: 8, uDASH: 5, duffs: 3 },
}

const UNIT_KEY = 'radar.unit'
const FIAT_KEY = 'radar.fiat'
export const DISPLAY_UNITS: readonly DisplayUnit[] = ['DASH', 'mDASH', 'uDASH', 'duffs']

/** What the reader picks as the primary unit: a Dash denomination, or USD (mainnet only; DASH then follows it). */
export type UnitChoice = DisplayUnit | 'USD'
export const UNIT_CHOICES: readonly UnitChoice[] = [...DISPLAY_UNITS, 'USD']

/** The Dash denomination to draw DASH figures in: DASH itself when USD is the primary unit. */
export function denomination(choice: UnitChoice): DisplayUnit {
  return choice === 'USD' ? 'DASH' : choice
}

export interface UnitPrefs {
  unit: UnitChoice
  /** Show the USD value after DASH figures that ask for it (mainnet only). */
  fiat: boolean
}

function readKey(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeKey(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // storage unavailable: the preference lasts for the session only
  }
}

export function readUnitPreference(): UnitChoice {
  const stored = readKey(UNIT_KEY)
  return UNIT_CHOICES.find((u) => u === stored) ?? 'DASH'
}

export function readFiatPreference(): boolean {
  return readKey(FIAT_KEY) !== '0'
}

const prefListeners = new Set<() => void>()
let prefSnapshot: UnitPrefs = { unit: 'DASH', fiat: true }

/** A stable object until a preference changes, for `useSyncExternalStore`. */
export function getUnitPrefs(): UnitPrefs {
  const unit = readUnitPreference()
  const fiat = readFiatPreference()
  if (prefSnapshot.unit !== unit || prefSnapshot.fiat !== fiat) prefSnapshot = { unit, fiat }
  return prefSnapshot
}

function emitPrefs(): void {
  for (const cb of [...prefListeners]) cb()
}

export function writeUnitPreference(unit: UnitChoice): void {
  writeKey(UNIT_KEY, unit)
  emitPrefs()
}

export function writeFiatPreference(fiat: boolean): void {
  writeKey(FIAT_KEY, fiat ? '1' : '0')
  emitPrefs()
}

export function subscribeUnitPrefs(cb: () => void): () => void {
  prefListeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === UNIT_KEY || e.key === FIAT_KEY) cb()
  }
  globalThis.addEventListener?.('storage', onStorage)
  return () => {
    prefListeners.delete(cb)
    globalThis.removeEventListener?.('storage', onStorage)
  }
}

export function unitLabel(unit: DisplayUnit, testnet = false): string {
  if (unit === 'duffs') return 'duffs'
  const base = unit === 'uDASH' ? 'µDASH' : unit
  return testnet ? `t${base}` : base
}

export interface FixedParts {
  negative: boolean
  int: string
  frac: string
}

/** value / 10^scale rounded half away from zero to `digits` places, as exact integer arithmetic. */
export function fixedParts(value: bigint, scale: number, digits: number): FixedParts {
  const negative = value < 0n
  const abs = negative ? -value : value
  let n: bigint
  if (digits < scale) {
    const div = 10n ** BigInt(scale - digits)
    n = (abs + div / 2n) / div
  } else {
    n = abs * 10n ** BigInt(digits - scale)
  }
  const s = n.toString().padStart(digits + 1, '0')
  return {
    negative: negative && n !== 0n,
    int: digits === 0 ? s : s.slice(0, -digits),
    frac: digits === 0 ? '' : s.slice(-digits),
  }
}

export function decimalSeparator(): string {
  return (
    new Intl.NumberFormat(getFormatLocale()).formatToParts(1.1).find((p) => p.type === 'decimal')
      ?.value ?? '.'
  )
}

export function groupDigits(int: string): string {
  return formatNumber(BigInt(int))
}

export type Density = 'prose' | 'table'

export interface AmountText {
  sign: '' | '+' | typeof MINUS
  int: string
  /** Decimal part with its separator, significant digits first. */
  frac: string
  /** The trailing digits drawn dimmed (table density). */
  dim: string
  unit: string
  suffix: string
  negative: boolean
  zero: boolean
}

export interface AmountFormatOptions {
  unit?: DisplayUnit
  testnet?: boolean
  signed?: boolean
  compact?: boolean
  density?: Density
}

export type AmountKind = 'duffs' | 'credits' | { token: { decimals: number; symbol?: string } }

const SMALL_FEE_DUFFS = 10_000n

function trimmedFraction(frac: string): string {
  const trimmed = frac.replace(/0+$/, '')
  return trimmed ? decimalSeparator() + trimmed : ''
}

/**
 * `wanted` decimals, or, for a nonzero value below one unit of the last of them, enough to show its first two
 * significant digits. Every value under that unit reads the same way, so a larger amount never prints as a smaller one.
 */
function placesFor(abs: bigint, scale: number, wanted: number): number {
  if (abs === 0n || wanted >= scale || abs >= 10n ** BigInt(scale - wanted)) return wanted
  return Math.min(scale, scale - abs.toString().length + 2)
}

const COMPACT = [
  { pow: 9, suffix: ' B' },
  { pow: 6, suffix: ' M' },
  { pow: 3, suffix: 'k' },
] as const

function compactParts(abs: bigint, scale: number) {
  const first = COMPACT.findIndex((c) => abs >= 10n ** BigInt(scale + c.pow))
  if (first < 0) return undefined
  const at = (index: number) => {
    const step = COMPACT[index]!
    return { step, parts: fixedParts(abs, scale + step.pow, step.pow === 3 ? 1 : 2) }
  }
  const hit = at(first)
  return hit.parts.int === '1000' && first > 0 ? at(first - 1) : hit
}

export function formatAmountParts(
  value: bigint,
  kind: AmountKind,
  options: AmountFormatOptions = {},
): AmountText {
  const { testnet = false, signed = false, compact = false, density = 'prose' } = options
  const token = typeof kind === 'object' ? kind.token : undefined
  const base = typeof kind === 'string' ? kind : undefined
  const negative = value < 0n
  const abs = negative ? -value : value
  let unit: DisplayUnit = options.unit ?? 'DASH'
  let scale: number
  let unitText: string
  if (token) {
    scale = token.decimals
    unitText = token.symbol ?? ''
  } else if (base) {
    const duffs = base === 'credits' ? abs / 1000n : abs
    if (!options.unit && abs > 0n && duffs < SMALL_FEE_DUFFS) unit = 'duffs'
    scale = SCALE[base][unit]
    unitText = unitLabel(unit, testnet)
  } else {
    scale = 0
    unitText = ''
  }

  let int: string
  let frac = ''
  let dim = ''
  let suffix = ''

  const tableDigits = placesFor(abs, scale, Math.min(scale, 8))
  const proseDigits = placesFor(abs, scale, Math.min(scale, 4))
  const compacted = compact ? compactParts(abs, scale) : undefined

  if (compacted) {
    int = groupDigits(compacted.parts.int)
    frac = trimmedFraction(compacted.parts.frac)
    suffix = compacted.step.suffix
  } else if (token) {
    const p = fixedParts(abs, scale, scale)
    int = groupDigits(p.int)
    frac = trimmedFraction(p.frac)
  } else if (density === 'table' && scale > 0) {
    const p = fixedParts(abs, scale, tableDigits)
    int = groupDigits(p.int)
    const shown = decimalSeparator() + p.frac
    if (tableDigits === 8) {
      frac = shown.slice(0, -4)
      dim = shown.slice(-4)
    } else {
      frac = shown
    }
  } else {
    const digits = compact ? placesFor(abs, scale, Math.min(scale, 2)) : proseDigits
    const p = fixedParts(abs, scale, digits)
    int = groupDigits(p.int)
    const f = compact ? p.frac.replace(/0+$/, '') : p.frac
    frac = digits === 0 || /^0*$/.test(f) ? '' : decimalSeparator() + f
  }

  const shownNonZero = /[1-9]/.test(int + frac + dim)
  const sign = !shownNonZero ? '' : negative ? MINUS : signed ? '+' : ''
  return {
    sign,
    int,
    frac,
    dim,
    unit: unitText,
    suffix,
    negative: negative && shownNonZero,
    zero: abs === 0n,
  }
}

export function formatAmountText(
  value: bigint,
  kind: AmountKind,
  options?: AmountFormatOptions,
): string {
  const a = formatAmountParts(value, kind, options)
  const unit = a.unit ? `\u00a0${a.unit}` : ''
  return `${a.sign}${a.int}${a.frac}${a.dim}${a.suffix}${unit}`
}

/** Round a non-negative decimal (n / 10^scale) to `sig` significant figures, half up. */
function roundSignificant(n: bigint, scale: number, sig: number): { value: bigint; scale: number } {
  if (n === 0n) return { value: 0n, scale: 0 }
  const digits = n.toString().length
  const drop = digits - sig
  if (drop <= 0) return { value: n, scale }
  const div = 10n ** BigInt(drop)
  return { value: (n + div / 2n) / div, scale: scale - drop }
}

const RATE_PRECISION = 1_000_000

/** USD for an amount of duffs at `usdPerDash`, to three significant figures, e.g. "≈ $2,310". */
export function formatFiat(duffs: bigint, usdPerDash: number, signed = false): string {
  if (!Number.isFinite(usdPerDash) || usdPerDash < 0) return ''
  const rateMicro = BigInt(Math.round(usdPerDash * RATE_PRECISION))
  const abs = duffs < 0n ? -duffs : duffs
  const micro = (abs * rateMicro + DUFFS_PER_DASH / 2n) / DUFFS_PER_DASH
  const scaleStart = 6
  const rounded = roundSignificant(micro, scaleStart, 3)
  let int: string
  let frac: string
  if (rounded.scale >= 0) {
    const p = fixedParts(rounded.value, rounded.scale, Math.max(0, rounded.scale))
    int = p.int
    frac = p.frac
  } else {
    int = (rounded.value * 10n ** BigInt(-rounded.scale)).toString()
    frac = ''
  }
  if (duffs !== 0n && rounded.value === 0n) return '< $0.000001'
  const sign = rounded.value === 0n ? '' : duffs < 0n ? MINUS : signed ? '+' : ''
  return `≈ ${sign}$${groupDigits(int)}${rounded.scale > 0 ? trimmedFraction(frac) : ''}`
}
