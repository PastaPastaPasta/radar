const DAY = 86_400_000
const HOUR = 3_600_000
const MINUTE = 60_000

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

/** "18 days", "3 hours", "12 minutes": coarse, for the lag line on a stale source. */
export function humanizeSpan(ms: number): string {
  if (ms >= DAY) return plural(Math.floor(ms / DAY), 'day')
  if (ms >= HOUR) return plural(Math.floor(ms / HOUR), 'hour')
  return plural(Math.max(1, Math.floor(ms / MINUTE)), 'minute')
}

export const formatBlock = (n: number) => n.toLocaleString('en-US')

export function indexedLagDetail(
  indexedHeight: number,
  blocksBehind: number,
  msBehind?: number,
): string {
  const head = `indexed to block ${formatBlock(indexedHeight)}`
  if (blocksBehind <= 0) return head
  const span =
    msBehind !== undefined && msBehind >= MINUTE
      ? `${humanizeSpan(msBehind)} behind`
      : `${formatBlock(blocksBehind)} blocks behind`
  return `${head} (${span})`
}
