import { t } from '@lingui/core/macro'
import type { SourceStamp, SourceId } from '@/data/envelope'
import type { SourceHealth } from '@/data/health'
import type { HyStatus } from '@/data/hyphen/schemas'
import type { PeStatus } from '@/data/pe/schemas'
import type { RadarNetworkStatus } from '@/data/radar/schemas'
import { clampSkew, formatInt, formatRelative } from '@/lib/format'

export interface ProbeFacts {
  stamp: SourceStamp
  /** One line of what the backend itself reports, such as "Last crawl finished 4 min ago". */
  report: string
}

export function radarFacts(
  status: RadarNetworkStatus,
  stamp: SourceStamp,
  now: number,
): ProbeFacts {
  const finished = status.crawl.last_finished
  const report =
    finished === null
      ? t`No crawl has finished yet.`
      : t`Last crawl finished ${formatRelative(clampSkew(finished, now), now)}. Its Core node is at block ${formatInt(status.chain.blocks)}.`
  return { stamp, report }
}

export function peFacts(status: PeStatus, stamp: SourceStamp): ProbeFacts {
  const indexed = formatInt(status.api.block.height)
  const chain = formatInt(status.tenderdash.block.height)
  const state = status.indexer.status
  return {
    stamp,
    report: t`Indexed to Platform block ${indexed} of ${chain}. Indexer: ${state}.`,
  }
}

export function hyphenFacts(status: HyStatus, stamp: SourceStamp): ProbeFacts {
  const heights = Object.values(status.indices).map((i) => i.indexedHeight)
  const indexed = formatInt(heights.length > 0 ? Math.min(...heights) : 0)
  const chain = formatInt(status.blockHeight)
  const sync = status.syncMode ? `${status.syncStatus}, ${status.syncMode}` : status.syncStatus
  return { stamp, report: t`Indexed to Core block ${indexed} of ${chain}. Sync: ${sync}.` }
}

const ERROR_TEXT: Record<string, () => string> = {
  network: () => t`The connection failed.`,
  timeout: () => t`It took too long to answer.`,
  http: () => t`It answered with an error.`,
  'rate-limited': () => t`It is rate limiting this browser.`,
  'invalid-response': () => t`It sent an answer Radar can’t read.`,
}

/** What to tell a visitor about one source, from the health registry alone. */
export function describeHealth(health: SourceHealth, now: number): string {
  const ago = (ms: number) => formatRelative(clampSkew(ms, now), now)
  switch (health.state) {
    case 'unknown':
      return t`Nothing has asked it yet on this network.`
    case 'down': {
      const reason = health.lastError ? (ERROR_TEXT[health.lastError.kind]?.() ?? '') : ''
      const last =
        health.lastOkAt === undefined
          ? t`It hasn’t answered yet.`
          : t`Last good ${ago(health.lastOkAt)}.`
      return `${reason} ${last}`.trim()
    }
    case 'stale':
      return health.lag?.detail ?? t`Its data is behind.`
    case 'degraded': {
      if (health.budget && health.budget.pressure !== 'ok')
        return t`The request budget is nearly used.`
      const reason = health.lastError ? (ERROR_TEXT[health.lastError.kind]?.() ?? '') : ''
      return `${t`Some requests are failing.`} ${reason}`.trim()
    }
    case 'slow': {
      const seconds = ((health.p50LatencyMs ?? 0) / 1000).toFixed(1)
      return t`The median answer takes ${seconds} s.`
    }
    case 'ok':
      return health.lag?.detail ?? ''
  }
}

export const SOURCE_ROLE: Record<SourceId, () => { name: string; role: string }> = {
  dapi: () => ({
    name: t`DAPI`,
    role: t`Core tip, blocks and transactions, straight from evonodes`,
  }),
  sdk: () => ({
    name: t`Platform SDK`,
    role: t`Proof-checked Platform state, verified in this browser`,
  }),
  radar: () => ({ name: t`Radar crawler`, role: t`The masternode census and network history` }),
  pe: () => ({ name: t`Platform Explorer`, role: t`Platform lists and counts` }),
  hyphen: () => ({ name: t`Hyphen`, role: t`Core addresses, mempool, governance and block lists` }),
  rate: () => ({ name: t`Price feed`, role: t`The USD rate, through Platform Explorer` }),
  local: () => ({ name: t`This browser`, role: t`Figures computed on your device` }),
}

export function medianText(ms: number): string {
  const rounded = Math.round(ms)
  return t`Median answer ${rounded} ms`
}
