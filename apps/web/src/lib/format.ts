const DEFAULT_LOCALE = 'en'

let activeLocale = DEFAULT_LOCALE

export function setFormatLocale(locale: string): void {
  activeLocale = locale || DEFAULT_LOCALE
}

export function getFormatLocale(): string {
  return activeLocale
}

export const MINUS = '−'
const UTC_KEY = 'radar.utc'

export function readUtcPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(UTC_KEY) === '1'
  } catch {
    return false
  }
}

export function formatNumber(n: number | bigint, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(activeLocale, options).format(n)
}

export function formatInt(n: number | bigint): string {
  return typeof n === 'bigint'
    ? formatNumber(n)
    : formatNumber(Math.round(n), { maximumFractionDigits: 0 })
}

export function formatPercent(ratio: number, fractionDigits = 1): string {
  return `${formatNumber(ratio * 100, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`
}

const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number): string {
  let value = Math.abs(bytes)
  let i = 0
  while (value >= 1000 && i < BYTE_UNITS.length - 1) {
    value /= 1000
    i++
  }
  let digits = i === 0 || value >= 100 ? 0 : 1
  if (i < BYTE_UNITS.length - 1 && Number(value.toFixed(digits)) >= 1000) {
    value /= 1000
    i++
    digits = 1
  }
  const text = formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${bytes < 0 ? MINUS : ''}${text} ${BYTE_UNITS[i]}`
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The two largest units: "2 d 4 h", "3 h 12 min", "8 min", "21 s". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / SECOND))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`
  if (m > 0) return `${m} min`
  return `${s} s`
}

export interface DateOptions {
  utc?: boolean
  time?: boolean
  date?: boolean
  seconds?: boolean
  zone?: boolean
}

function dateLocale(): string {
  return activeLocale === 'en' ? 'en-GB' : activeLocale
}

function zoneName(ms: number, utc: boolean): string {
  if (utc) return 'UTC'
  const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? 'UTC'
}

/** "14:28 UTC", "10 Nov 2026" or "10 Nov 2026, 14:28 UTC", in the viewer's zone unless UTC is chosen. */
export function formatDate(ms: number, options: DateOptions = {}): string {
  const {
    utc = readUtcPreference(),
    time = true,
    date = true,
    seconds = false,
    zone = true,
  } = options
  const parts: Intl.DateTimeFormatOptions = {
    hourCycle: 'h23',
    ...(utc ? { timeZone: 'UTC' } : {}),
    ...(date ? { day: 'numeric', month: 'short', year: 'numeric' } : {}),
    ...(time
      ? { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }
      : {}),
  }
  const text = new Intl.DateTimeFormat(dateLocale(), parts).format(ms)
  return time && zone ? `${text} ${zoneName(ms, utc)}` : text
}

export function formatIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Local clocks run a little behind the network: a stamp up to a minute ahead is "now". */
export function clampSkew(ms: number, now: number): number {
  return ms > now && ms - now < MINUTE ? now : ms
}

/** "21 s ago", "8 min ago", "2 h ago", "yesterday", then "6 Nov" (with the year when it differs). */
export function formatRelative(ms: number, now: number = Date.now()): string {
  const delta = now - ms
  const abs = Math.abs(delta)
  const future = delta <= -SECOND
  const wrap = (text: string) => (future ? `in ${text}` : `${text} ago`)
  if (abs < MINUTE) return wrap(`${Math.max(0, Math.floor(abs / SECOND))} s`)
  if (abs < HOUR) return wrap(`${Math.floor(abs / MINUTE)} min`)
  if (abs < DAY) return wrap(`${Math.floor(abs / HOUR)} h`)
  if (!future && abs < 2 * DAY) return 'yesterday'
  const sameYear = new Date(ms).getUTCFullYear() === new Date(now).getUTCFullYear()
  return new Intl.DateTimeFormat(dateLocale(), {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    ...(readUtcPreference() ? { timeZone: 'UTC' } : {}),
  }).format(ms)
}
