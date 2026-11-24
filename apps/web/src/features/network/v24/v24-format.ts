import { formatDate } from '@/lib/format'

/** "10 Nov 2026, 14:28 UTC" for a time in ms. */
export const when = (ms: number | null | undefined): string =>
  ms == null ? '' : formatDate(ms, { utc: true, zone: true })

/** "3 Dec 2026" for a time in ms, by UTC. */
export const day = (ms: number): string => formatDate(ms, { utc: true, time: false, zone: false })

/** Places a label over a bar at `ratio` of its width, shifted by the same share of its own width so it never leaves the bar. */
export const pinAt = (ratio: number): { left: string; transform: string } => {
  const r = Math.min(1, Math.max(0, ratio)) * 100
  return { left: `${String(r)}%`, transform: `translateX(-${String(r)}%)` }
}

export const share = (n: number, of: number): string =>
  `${String(Math.round((n / of) * 1000) / 10)}%`
