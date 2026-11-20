import { t } from '@lingui/core/macro'
import { CRAWL_STALE_MS } from '@/lib/crawl'
import type { SourceId, SourceStamp } from '@/data/envelope'
import type { HealthState, SourceHealth } from '@/data/health'
import { clampSkew, formatRelative, formatIsoUtc } from '@/lib/format'
import type { LiveConnection } from './live-connection'
import type { IconName } from './icon-paths'

export type SourceVariant = 'ok' | 'proof' | 'stale' | 'down'

export interface SourceView {
  label: string
  icon: IconName
  variant: SourceVariant
  /** Relative age to show after the label ("12 s ago"), or the last-good time when down. */
  age?: string
  ageTitle?: string
  /** How far the index trails the chain ("indexed to block N (9 minutes behind)"); shown in place of `age`. */
  lag?: string
  spinner?: boolean
  title?: string
  state: HealthState | 'live'
}

const MIN = 60_000

/**
 * The age below which a mark is never drawn as out of date, whatever its stamp says: a reading a few minutes old is
 * simply a few minutes old, and reads as quiet ink. A stamp's own limit (`staleAfterMs`, the data class's
 * staleTime × 4) applies where it is longer. Radar's is three missed crawls.
 */
const QUIET_AGE_MS: Record<SourceId, number> = {
  radar: CRAWL_STALE_MS,
  pe: 10 * MIN,
  hyphen: 10 * MIN,
  insight: 10 * MIN,
  dapi: 10 * MIN,
  sdk: 10 * MIN,
  rate: 10 * MIN,
  local: Infinity,
}

/** The age past which a reading from `source` shows as out of date: the source's quiet age or the stamp's own limit. */
export function staleAgeMs(source: SourceId, staleAfterMs = 0): number {
  // Radar's crawl has one threshold everywhere, whatever the query's class says.
  if (source === 'radar') return CRAWL_STALE_MS
  return Math.max(staleAfterMs, QUIET_AGE_MS[source])
}

/** An index this far behind the chain says so in the visible line; one block behind is the index doing its work. */
const LAG_BLOCKS_SHOWN = 2
const LAG_MS_SHOWN = 5 * MIN
const INDEXES: ReadonlySet<SourceId> = new Set(['hyphen', 'insight', 'pe'])

/** What the line says in place of the read's age when the index trails the chain: "indexed to block N (9 minutes behind)". */
function shownLag(stamp: SourceStamp, health: SourceHealth): string | undefined {
  const lag = health.lag
  if (!lag || stamp.immutable || stamp.fallback || !INDEXES.has(stamp.source)) return undefined
  const behind =
    lag.blocks !== undefined ? lag.blocks >= LAG_BLOCKS_SHOWN : (lag.ms ?? 0) >= LAG_MS_SHOWN
  return behind ? lag.detail : undefined
}

/** What a source is called in a sentence. Product names stay as they are; the generic ones are translated. */
export function sourceName(source: SourceId): string {
  switch (source) {
    case 'sdk':
    case 'dapi':
      return 'DAPI'
    case 'radar':
      return 'Radar'
    case 'pe':
      return 'Platform Explorer'
    case 'hyphen':
      return 'Hyphen'
    case 'insight':
      return 'Insight'
    case 'rate':
      return t`The price feed`
    case 'local':
      return t`Your browser`
  }
}

const ICON: Record<SourceId, IconName> = {
  sdk: 'dapi',
  dapi: 'dapi',
  radar: 'radar',
  pe: 'index',
  hyphen: 'index',
  insight: 'index',
  rate: 'coin',
  local: 'cpu',
}

function base(stamp: SourceStamp): { label: string; icon: IconName; showAge: boolean } {
  if (stamp.fallback === 'sdk-cold') {
    return { label: t`Indexed by Platform Explorer · checking…`, icon: 'index', showAge: false }
  }
  if (stamp.fallback === 'sdk-down') {
    return {
      label: t`Indexed by Platform Explorer · proofs unavailable`,
      icon: 'index',
      showAge: true,
    }
  }
  switch (stamp.source) {
    case 'sdk':
      return stamp.proved
        ? { label: t`Proof-checked`, icon: 'proof', showAge: true }
        : { label: t`Served by DAPI · not proved`, icon: 'dapi', showAge: false }
    case 'dapi':
      return { label: t`Served by DAPI`, icon: ICON.dapi, showAge: true }
    case 'radar':
      // A document that gave no crawl time has only the time it was fetched, which is not the data's age.
      if (stamp.radarTime === 'reading') {
        return { label: t`Checked by Radar`, icon: ICON.radar, showAge: !stamp.asOfFetched }
      }
      if (stamp.radarTime === 'earlier-crawl') {
        return {
          label: t`Crawled by Radar · an earlier crawl`,
          icon: ICON.radar,
          showAge: !stamp.asOfFetched,
        }
      }
      return { label: t`Crawled by Radar`, icon: ICON.radar, showAge: !stamp.asOfFetched }
    case 'pe':
      return { label: t`Indexed by Platform Explorer`, icon: ICON.pe, showAge: true }
    case 'hyphen':
      if (stamp.fallback === 'dapi-cold') {
        return {
          label: t`Indexed by Hyphen · checking with DAPI…`,
          icon: ICON.hyphen,
          showAge: false,
        }
      }
      if (stamp.fallback === 'dapi-down') {
        return { label: t`Indexed by Hyphen · DAPI unreachable`, icon: ICON.hyphen, showAge: false }
      }
      if (stamp.fallback === 'dapi-budget') {
        return { label: t`Indexed by Hyphen · DAPI busy`, icon: ICON.hyphen, showAge: false }
      }
      return { label: t`Indexed by Hyphen`, icon: ICON.hyphen, showAge: true }
    case 'insight':
      return { label: t`Indexed by Insight`, icon: ICON.insight, showAge: true }
    case 'rate':
      return { label: t`Price via Platform Explorer`, icon: ICON.rate, showAge: true }
    case 'local':
      return { label: t`Computed in your browser`, icon: ICON.local, showAge: false }
  }
}

/** What is wrong with a stamp's proof fields, or undefined: `proof` exists iff `proved`, and only the SDK proves. */
export function stampViolation(stamp: SourceStamp): string | undefined {
  if (stamp.proved && !stamp.proof) return 'a stamp is marked proved but carries no proof'
  if (!stamp.proved && stamp.proof) return 'a stamp carries a proof but is not marked proved'
  if (stamp.proved && stamp.source !== 'sdk') {
    return `a ${stamp.source} stamp is marked proved; only sdk answers are proof-checked`
  }
  return undefined
}

const reported = new WeakSet<SourceStamp>()

function assertStamp(stamp: SourceStamp): void {
  if (import.meta.env.PROD || reported.has(stamp)) return
  const problem = stampViolation(stamp)
  if (!problem) return
  reported.add(stamp)
  console.error(`[radar] ${problem} (docs/ARCHITECTURE.md §2.1)`, stamp)
}

/**
 * The stamp dated by when its data was true. Once live updates have stopped, nothing the stream pushed can be newer
 * than the last thing that arrived, so a pushed figure's age keeps counting from there instead of from a stamp renewed
 * on the page. A figure a request just returned keeps its own age.
 */
function datedByLive(stamp: SourceStamp, live: LiveConnection | undefined): SourceStamp {
  if (!stamp.pushed || live?.state !== 'stopped' || live.lastEventAt === undefined) {
    return stamp
  }
  return live.lastEventAt < stamp.asOf ? { ...stamp, asOf: live.lastEventAt } : stamp
}

export function sourceView(
  seen: SourceStamp,
  health: SourceHealth,
  now: number,
  live?: LiveConnection,
): SourceView {
  assertStamp(seen)
  const stamp = datedByLive(seen, live)
  const b = base(stamp)
  const down = health.state === 'down'
  const ageMs = Math.max(0, now - stamp.asOf)
  const stale =
    !down &&
    !stamp.immutable &&
    (stamp.fallback === 'dapi-down' ||
      health.state === 'stale' ||
      health.state === 'degraded' ||
      ageMs > staleAgeMs(stamp.source, stamp.staleAfterMs))
  const lag = shownLag(stamp, health)

  const proof = stamp.source === 'sdk' && stamp.proved && !stamp.fallback
  const title = [
    stamp.node ? t`Answered by ${stamp.node}` : undefined,
    health.lag?.detail,
    t`As of ${formatIsoUtc(stamp.asOf)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  if (down) {
    const last = health.lastOkAt ?? stamp.fetchedAt
    return {
      label: t`${sourceName(stamp.source)} isn't answering`,
      icon: b.icon,
      variant: 'down',
      age: t`last good ${formatRelative(clampSkew(last, now), now)}`,
      ageTitle: formatIsoUtc(last),
      title,
      state: 'down',
    }
  }
  return {
    label: b.label,
    icon: b.icon,
    variant: stale ? 'stale' : proof ? 'proof' : 'ok',
    age:
      lag === undefined && b.showAge && !stamp.immutable
        ? formatRelative(clampSkew(stamp.asOf, now), now)
        : undefined,
    ...(lag === undefined ? {} : { lag }),
    ageTitle: formatIsoUtc(stamp.asOf),
    spinner: stamp.fallback === 'sdk-cold' || stamp.fallback === 'dapi-cold',
    title,
    state: stale ? 'stale' : health.state === 'unknown' ? 'ok' : health.state,
  }
}
