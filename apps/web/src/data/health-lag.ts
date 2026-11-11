import { plural, t } from '@lingui/core/macro'
import { formatInt } from '@/lib/format'

const DAY = 86_400_000
const HOUR = 3_600_000
const MINUTE = 60_000

/** "18 days", "3 hours", "12 minutes": coarse, for the lag line on a stale source. */
export function humanizeSpan(ms: number): string {
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY)
    return plural(days, { one: '# day', other: '# days' })
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR)
    return plural(hours, { one: '# hour', other: '# hours' })
  }
  const minutes = Math.max(1, Math.floor(ms / MINUTE))
  return plural(minutes, { one: '# minute', other: '# minutes' })
}

export const formatBlock = (n: number) => formatInt(n)

export function indexedLagDetail(
  indexedHeight: number,
  blocksBehind: number,
  msBehind?: number,
): string {
  const block = formatBlock(indexedHeight)
  if (blocksBehind <= 0) return t`indexed to block ${block}`
  return msBehind !== undefined && msBehind >= MINUTE
    ? t`indexed to block ${block} (${humanizeSpan(msBehind)} behind)`
    : t`indexed to block ${block} (${formatBlock(blocksBehind)} blocks behind)`
}
