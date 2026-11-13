import { formatDate } from '@/lib/format'

/** "10 Nov 2026, 14:28 UTC" for a time in ms. */
export const when = (ms: number | null | undefined): string =>
  ms == null ? '' : formatDate(ms, { utc: true, zone: true })

export const share = (n: number, of: number): string =>
  `${String(Math.round((n / of) * 1000) / 10)}%`
