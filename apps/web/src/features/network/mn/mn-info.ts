import type { RadarMasternodeDetail } from '@/data/radar/schemas'
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
