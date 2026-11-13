import { getFormatLocale } from '@/lib/format'

const fmt = (ms: number, options: Intl.DateTimeFormatOptions): string =>
  new Intl.DateTimeFormat(getFormatLocale(), { ...options, timeZone: 'UTC' }).format(ms)

/** "Nov 2026". */
export const monthYear = (ms: number): string => fmt(ms, { month: 'short', year: 'numeric' })

/** "10 Nov 2026". */
export const dayMonthYear = (ms: number): string =>
  fmt(ms, { day: 'numeric', month: 'short', year: 'numeric' })

/** "10 Nov". */
export const dayMonth = (ms: number): string => fmt(ms, { day: 'numeric', month: 'short' })

/** "10 Nov, 14:28" in UTC, for a time on a chart or a table. */
export const dayMonthTime = (ms: number): string =>
  fmt(ms, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

const regions = new Map<string, Intl.DisplayNames>()

/** "Germany" from "DE", in the page's language. */
export function countryName(code: string): string {
  const locale = getFormatLocale()
  let names = regions.get(locale)
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: 'region' })
    regions.set(locale, names)
  }
  try {
    return names.of(code) ?? code
  } catch {
    return code
  }
}

/** The flag emoji of a two-letter country code. */
export function flag(code: string): string {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : ''
}
