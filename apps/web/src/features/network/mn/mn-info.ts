import type { DapiMnEntry } from '@/data/core/types'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'
import { base58Encode } from '@/lib/base58'
import { formatNumber } from '@/lib/format'
import { hexToBytes } from '@/lib/hex'
import type { NetworkId } from '@/lib/network'

export const PROTX = /^[0-9a-f]{64}$/i

export interface UptimeDay {
  day: string
  attempts: number
  ok: number
}

export type DayTone = 'good' | 'warn' | 'bad' | 'none'

/** A day with every check answered is good, half or more answered is "missed some", less is "missed most". */
export function dayTone(d: UptimeDay): DayTone {
  if (d.attempts <= 0) return 'none'
  const ratio = d.ok / d.attempts
  if (ratio >= 1) return 'good'
  return ratio >= 0.5 ? 'warn' : 'bad'
}

export interface UptimeSummary {
  ratio: number
  ok: number
  attempts: number
  days: number
}

/** Radar's `uptime_daily` is oldest first; the window is its newest `days` entries that carry any checks. */
export function uptimeSummary(daily: readonly UptimeDay[], days = 30): UptimeSummary | null {
  const window = daily.slice(-days).filter((d) => d.attempts > 0)
  const attempts = window.reduce((sum, d) => sum + d.attempts, 0)
  if (attempts === 0) return null
  const ok = window.reduce((sum, d) => sum + d.ok, 0)
  return { ratio: ok / attempts, ok, attempts, days: window.length }
}

export type PoseState = 'clear' | 'penalised' | 'banned'

export function poseState(d: Pick<RadarMasternodeDetail, 'status' | 'pose_penalty'>): PoseState {
  if (d.status === 'pose_banned') return 'banned'
  return d.pose_penalty > 0 ? 'penalised' : 'clear'
}

/** Radar's `operator_reward` is a percentage, as Dash Core's `protx info` gives it (a ProRegTx payload holds basis points). */
export function operatorRewardText(percent: number): string {
  return `${formatNumber(percent, { maximumFractionDigits: 2 })}%`
}

/** When and where a masternode left the list, as far as Radar's record says. */
export interface Departure {
  height: number | null
  /** Milliseconds. */
  at: number | null
  /**
   * True once DAPI's list has answered without it. Radar's own `removed` can be wrong for a while: its crawler marks
   * a masternode removed when one list fetch comes back short, and logs it as returned on the next.
   */
  confirmed: boolean
  service: string | null
}

/**
 * Radar's record of a masternode that has left the list, or null while it is on it. An entry in DAPI's list means it
 * is listed, whatever Radar's last crawl says; the departure is a fact only once DAPI's list has answered without it
 * (`dapiAnswered`), and Radar's claim until then.
 */
export function departureOf(
  d: Pick<RadarMasternodeDetail, 'removed' | 'changes'> | null,
  f: DapiFacts | null,
  dapiAnswered: boolean,
): Departure | null {
  if (!d || f || d.removed === null || d.removed === undefined || d.removed === false) return null
  const left = d.changes
    .filter((c) => c.field === 'removed')
    .reduce<(typeof d.changes)[number] | undefined>(
      (last, c) => (last === undefined || (c.height ?? 0) > (last.height ?? 0) ? c : last),
      undefined,
    )
  return {
    height: left?.height ?? null,
    at: left?.ts ?? (typeof d.removed === 'number' ? d.removed * 1000 : null),
    service: typeof left?.old === 'string' ? left.old : null,
    confirmed: dapiAnswered,
  }
}

/** Radar reports "none" as -1. */
export function heightOrNull(height: number | null | undefined): number | null {
  return height === null || height === undefined || height < 0 ? null : height
}

export function placeOf(d: Pick<RadarMasternodeDetail, 'city' | 'country'>): string {
  return [d.city, d.country].filter(Boolean).join(', ')
}

export function isEvonode(d: Pick<RadarMasternodeDetail, 'type'>): boolean {
  return d.type === 'Evo'
}

/** A collateral outpoint is `<txid>-<index>`. */
export function parseOutpoint(outpoint: string): { txid: string; index: number } | null {
  const m = /^([0-9a-f]{64})-(\d+)$/i.exec(outpoint)
  return m ? { txid: (m[1] ?? '').toLowerCase(), index: Number(m[2]) } : null
}

/** `host:port`, `[v6]:port` or a bare host. */
export function splitService(service: string): { host: string; port: string | null } {
  const bracketed = /^(\[[^\]]+\])(?::(\d+))?$/.exec(service)
  if (bracketed) return { host: bracketed[1] ?? service, port: bracketed[2] ?? null }
  const i = service.lastIndexOf(':')
  if (i > 0 && service.indexOf(':') === i) {
    return { host: service.slice(0, i), port: service.slice(i + 1) }
  }
  return { host: service, port: null }
}

export const otherNetwork = (net: NetworkId): 'mainnet' | 'testnet' | null =>
  net === 'mainnet' ? 'testnet' : net === 'testnet' ? 'mainnet' : null

export type CheckState = 'pass' | 'fail' | 'unknown'

export function checkState(value: string): CheckState {
  const v = value.toLowerCase()
  return v === 'pass' ? 'pass' : v === 'fail' ? 'fail' : 'unknown'
}

/** A ProTx hash is a Platform identity id once written in base58. */
export const protxToBase58 = (hex: string): string => base58Encode(hexToBytes(hex.toLowerCase()))

export const MN_TABS = ['overview', 'network', 'platform', 'history', 'payments'] as const
export type MnTab = (typeof MN_TABS)[number]

/** What DAPI's masternode list says about a ProTx, in the page's own terms. */
export interface DapiFacts {
  type: 'Regular' | 'Evo'
  valid: boolean
  service: string
  votingAddress: string
  pubKeyOperator: string
  platformHttpPort: number | null
  platformP2pPort: number | null
  platformNodeId: string | null
}

export function dapiFacts(entry: DapiMnEntry): DapiFacts {
  return {
    type: entry.type === 1 ? 'Evo' : 'Regular',
    valid: entry.isValid,
    service: entry.service,
    votingAddress: entry.votingAddress,
    pubKeyOperator: entry.pubKeyOperator,
    platformHttpPort: entry.platformHttpPort ?? null,
    platformP2pPort: entry.platformP2pPort ?? null,
    platformNodeId: entry.platformNodeId ?? null,
  }
}

export interface Differing {
  service: boolean
  type: boolean
  voting: boolean
  operator: boolean
  nodeId: boolean
  valid: boolean
}

/** Where Radar's last crawl disagrees with DAPI's list (DAPI wins; the page says so). */
export function crawlDiffers(d: RadarMasternodeDetail, f: DapiFacts): Differing {
  return {
    service: d.service !== null && d.service !== f.service,
    type: (d.type === 'Evo' ? 'Evo' : 'Regular') !== f.type,
    voting: d.voting_address !== null && d.voting_address !== f.votingAddress,
    operator: d.pubkey_operator.toLowerCase() !== f.pubKeyOperator.toLowerCase(),
    nodeId:
      f.platformNodeId !== null &&
      d.platform_node_id !== null &&
      d.platform_node_id.toLowerCase() !== f.platformNodeId.toLowerCase(),
    valid: (d.status === 'enabled') !== f.valid,
  }
}

export const anyDiffers = (x: Differing): boolean => Object.values(x).some(Boolean)

export const DKG_CHECK_ORDER = [
  'protocol',
  'relay',
  'filters',
  'reachable',
  'platform_ban',
] as const
export type DkgCheckId = (typeof DKG_CHECK_ORDER)[number]

export interface DkgRules {
  release: string
  minProtocol: number
  filtersBit: number
  reachFailures: number
  maxFailedOutbound: number
  coreCommit: string
  protocolCheck: boolean
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

/** The thresholds Radar applied, with the numbers of the Dash Core 24 rules where it sent none. */
export function dkgRules(raw: Record<string, unknown> | undefined): DkgRules {
  const r = raw ?? {}
  return {
    release: typeof r.release === 'string' ? r.release : 'Dash Core 24',
    minProtocol: num(r.min_protocol, 70242),
    filtersBit: num(r.compact_filters_bit, 6),
    reachFailures: num(r.reach_failures, 3),
    maxFailedOutbound: num(r.core_max_failed_outbound, 5),
    coreCommit: typeof r.core_commit === 'string' ? r.core_commit : 'v24.0.0',
    protocolCheck: r.protocol_check !== false,
  }
}

/** Where the rule lives in Dash Core, at the commit or tag Radar read it from. */
export const dkgRuleUrl = (rules: DkgRules): string =>
  `https://github.com/dashpay/dash/blob/${encodeURIComponent(rules.coreCommit)}/src/active/dkgsession.cpp`

export const isDkgCheck = (id: string): id is DkgCheckId =>
  (DKG_CHECK_ORDER as readonly string[]).includes(id)
