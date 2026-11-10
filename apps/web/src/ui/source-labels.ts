import type { SourceId, SourceStamp } from '@/data/envelope'
import type { HealthState, SourceHealth } from '@/data/health'
import { clampSkew, formatRelative, formatIsoUtc } from '@/lib/format'
import type { IconName } from './icon-paths'

export type SourceVariant = 'ok' | 'proof' | 'stale' | 'down'

export interface SourceView {
  label: string
  icon: IconName
  variant: SourceVariant
  /** Relative age to show after the label ("12 s ago"), or the last-good time when down. */
  age?: string
  ageTitle?: string
  spinner?: boolean
  title?: string
  state: HealthState | 'live'
}

const MIN = 60_000

/** Past this age the mark turns warning orange, for a stamp that doesn't say its own (`staleAfterMs`, the data class's staleTime × 4). */
export const STALE_AGE_MS: Record<SourceId, number> = {
  radar: 20 * MIN,
  pe: 2 * MIN,
  hyphen: 2 * MIN,
  dapi: 2 * MIN,
  sdk: 2 * MIN,
  rate: 4 * MIN,
  local: Infinity,
}

export const SOURCE_NAME: Record<SourceId, string> = {
  sdk: 'DAPI',
  dapi: 'DAPI',
  radar: 'Radar',
  pe: 'Platform Explorer',
  hyphen: 'Hyphen',
  rate: 'The price feed',
  local: 'Your browser',
}

const ICON: Record<SourceId, IconName> = {
  sdk: 'dapi',
  dapi: 'dapi',
  radar: 'radar',
  pe: 'index',
  hyphen: 'index',
  rate: 'coin',
  local: 'cpu',
}

function base(stamp: SourceStamp): { label: string; icon: IconName; showAge: boolean } {
  if (stamp.fallback === 'sdk-cold') {
    return { label: 'Indexed by Platform Explorer · checking…', icon: 'index', showAge: false }
  }
  switch (stamp.source) {
    case 'sdk':
      return stamp.proved
        ? { label: 'Proof-checked', icon: 'proof', showAge: true }
        : { label: 'Served by DAPI · not proved', icon: 'dapi', showAge: false }
    case 'dapi':
      return { label: 'Served by DAPI', icon: ICON.dapi, showAge: true }
    case 'radar':
      return {
        label: stamp.asOfFetched ? 'Fetched from Radar' : 'Crawled by Radar',
        icon: ICON.radar,
        showAge: true,
      }
    case 'pe':
      return { label: 'Indexed by Platform Explorer', icon: ICON.pe, showAge: true }
    case 'hyphen':
      if (stamp.fallback === 'dapi-down') {
        return { label: 'Indexed by Hyphen · DAPI unreachable', icon: ICON.hyphen, showAge: false }
      }
      if (stamp.fallback === 'dapi-budget') {
        return { label: 'Indexed by Hyphen · DAPI busy', icon: ICON.hyphen, showAge: false }
      }
      return { label: 'Indexed by Hyphen', icon: ICON.hyphen, showAge: true }
    case 'rate':
      return { label: 'Price via Platform Explorer', icon: ICON.rate, showAge: true }
    case 'local':
      return { label: 'Computed in your browser', icon: ICON.local, showAge: false }
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

export function sourceView(stamp: SourceStamp, health: SourceHealth, now: number): SourceView {
  assertStamp(stamp)
  const b = base(stamp)
  const down = health.state === 'down'
  const ageMs = Math.max(0, now - stamp.asOf)
  const stale =
    !down &&
    !stamp.immutable &&
    (stamp.fallback === 'dapi-down' ||
      health.state === 'stale' ||
      health.state === 'degraded' ||
      ageMs > (stamp.staleAfterMs ?? STALE_AGE_MS[stamp.source]))

  const proof = stamp.source === 'sdk' && stamp.proved && !stamp.fallback
  const title = [
    stamp.node ? `Answered by ${stamp.node}` : undefined,
    health.lag?.detail,
    `As of ${formatIsoUtc(stamp.asOf)}`,
  ]
    .filter(Boolean)
    .join(' · ')

  if (down) {
    const last = health.lastOkAt ?? stamp.fetchedAt
    return {
      label: `${SOURCE_NAME[stamp.source]} isn't answering`,
      icon: b.icon,
      variant: 'down',
      age: `last good ${formatRelative(clampSkew(last, now), now)}`,
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
      b.showAge && !stamp.immutable ? formatRelative(clampSkew(stamp.asOf, now), now) : undefined,
    ageTitle: formatIsoUtc(stamp.asOf),
    spinner: stamp.fallback === 'sdk-cold',
    title,
    state: stale ? 'stale' : health.state === 'unknown' ? 'ok' : health.state,
  }
}
