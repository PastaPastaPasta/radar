import { useSyncExternalStore } from 'react'
import { getActiveNetwork, subscribeActiveNetwork } from './active-network'
import type { BudgetSnapshot } from './dapi-core/budget'
import type { SourceErrorKind } from './errors'
import type { SourceId } from './envelope'
import type { NetworkId } from '@/lib/network'

export type HealthState = 'unknown' | 'ok' | 'slow' | 'stale' | 'degraded' | 'down'

export interface SourceHealth {
  source: SourceId
  net: NetworkId
  state: HealthState
  lastOkAt?: number
  lastError?: { kind: SourceErrorKind; message: string; at: number }
  p50LatencyMs?: number
  /** Freshness lag, when the source reports one. */
  lag?: { blocks?: number; ms?: number; detail: string } // detail: "indexed to block 1,577,999 (18 days behind)"
  /** dapi only */
  budget?: BudgetSnapshot
}

export interface HealthRegistry {
  report(
    net: NetworkId,
    source: SourceId,
    r: { ok: boolean; latencyMs: number; kind?: SourceErrorKind; message?: string },
  ): void
  setLag(net: NetworkId, source: SourceId, lag: SourceHealth['lag']): void
  get(net: NetworkId, source: SourceId): SourceHealth
  subscribe(cb: () => void): () => void
}

type FailureKind = Exclude<SourceErrorKind, 'aborted'>

interface Call {
  ok: boolean
  at: number
  kind?: FailureKind
}

interface Tally {
  calls: Call[]
  latencies: number[]
  consecutiveDownFailures: number
  lastOkAt?: number
  lastInvalidAt?: number
  lastError?: SourceHealth['lastError']
  lag?: SourceHealth['lag']
  budget?: BudgetSnapshot
}

const MIN = 60_000
const CALL_WINDOW = 20
const LATENCY_WINDOW = 10
const DOWN_FAILURES = 3
const DOWN_SILENCE_MS = 120_000
const DEGRADED_RATIO = 0.25
const INVALID_MEMORY_MS = 5 * MIN

const SLOW_MS: Partial<Record<SourceId, number>> = { sdk: 5_000, dapi: 5_000 }
const SLOW_DEFAULT_MS = 3_000

const STALE_AFTER: Partial<Record<SourceId, { blocks?: number; ms?: number }>> = {
  radar: { ms: 45 * MIN },
  pe: { blocks: 10 },
  hyphen: { blocks: 3 },
  dapi: { ms: 20 * MIN },
  sdk: { ms: 15 * MIN },
}

const DOWN_KINDS: ReadonlySet<SourceErrorKind> = new Set(['network', 'timeout', 'http'])

function median(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function exceedsLag(source: SourceId, lag: SourceHealth['lag']): boolean {
  if (!lag) return false
  const limit = STALE_AFTER[source]
  if (!limit) return false
  if (limit.blocks !== undefined && lag.blocks !== undefined && lag.blocks > limit.blocks) {
    return true
  }
  return limit.ms !== undefined && lag.ms !== undefined && lag.ms > limit.ms
}

function compute(net: NetworkId, source: SourceId, rec: Tally | undefined, now: number) {
  const health: SourceHealth = { source, net, state: 'unknown' }
  if (!rec) return health
  health.lastOkAt = rec.lastOkAt
  health.lastError = rec.lastError
  health.p50LatencyMs = median(rec.latencies)
  health.lag = rec.lag
  if (source === 'dapi') health.budget = rec.budget

  const lastCall = rec.calls[rec.calls.length - 1]
  if (!lastCall && !rec.lag && !rec.budget) return health

  const failing = lastCall !== undefined && !lastCall.ok
  const silent = rec.lastOkAt === undefined || now - rec.lastOkAt > DOWN_SILENCE_MS
  if (
    rec.consecutiveDownFailures >= DOWN_FAILURES ||
    (failing && rec.consecutiveDownFailures >= 2 && silent)
  ) {
    health.state = 'down'
    return health
  }
  if (exceedsLag(source, rec.lag)) {
    health.state = 'stale'
    return health
  }
  const failures = rec.calls.filter((c) => !c.ok).length
  const pressured = rec.budget?.pressure === 'tight' || rec.budget?.pressure === 'exhausted'
  if (
    (rec.calls.length > 0 && failures / rec.calls.length >= DEGRADED_RATIO) ||
    (rec.lastInvalidAt !== undefined && now - rec.lastInvalidAt <= INVALID_MEMORY_MS) ||
    (source === 'dapi' && pressured)
  ) {
    health.state = 'degraded'
    return health
  }
  const slowAfter = SLOW_MS[source] ?? SLOW_DEFAULT_MS
  if (rec.latencies.length > 0 && (median(rec.latencies) ?? 0) > slowAfter) {
    health.state = 'slow'
    return health
  }
  health.state = rec.lastOkAt === undefined ? 'unknown' : 'ok'
  return health
}

export function createHealthRegistry(now: () => number = Date.now): HealthRegistry & {
  setBudget(net: NetworkId, snapshot: BudgetSnapshot | undefined): void
  reset(): void
} {
  const records = new Map<string, Tally>()
  const cache = new Map<string, SourceHealth>()
  const listeners = new Set<() => void>()

  const keyOf = (net: NetworkId, source: SourceId) => `${net}\u0000${source}`

  const touch = (net: NetworkId, source: SourceId): Tally => {
    const key = keyOf(net, source)
    let rec = records.get(key)
    if (!rec) {
      rec = { calls: [], latencies: [], consecutiveDownFailures: 0 }
      records.set(key, rec)
    }
    return rec
  }

  const changed = () => {
    for (const cb of [...listeners]) cb()
  }

  return {
    report(net, source, r) {
      const rec = touch(net, source)
      const at = now()
      rec.calls.push({ ok: r.ok, at, kind: r.ok ? undefined : (r.kind as FailureKind | undefined) })
      if (rec.calls.length > CALL_WINDOW) rec.calls.shift()
      rec.latencies.push(r.latencyMs)
      if (rec.latencies.length > LATENCY_WINDOW) rec.latencies.shift()
      if (r.ok) {
        rec.consecutiveDownFailures = 0
        rec.lastOkAt = at
      } else {
        const kind = r.kind ?? 'network'
        if (DOWN_KINDS.has(kind)) rec.consecutiveDownFailures++
        else rec.consecutiveDownFailures = 0
        if (kind === 'invalid-response') rec.lastInvalidAt = at
        rec.lastError = { kind, message: r.message ?? kind, at }
      }
      changed()
    },
    setLag(net, source, lag) {
      touch(net, source).lag = lag
      changed()
    },
    setBudget(net, snapshot) {
      touch(net, 'dapi').budget = snapshot
      changed()
    },
    get(net, source) {
      const key = keyOf(net, source)
      const fresh = compute(net, source, records.get(key), now())
      const hit = cache.get(key)
      if (hit && sameHealth(hit, fresh)) return hit
      cache.set(key, fresh)
      return fresh
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    reset() {
      records.clear()
      cache.clear()
      changed()
    },
  }
}

function sameHealth(a: SourceHealth, b: SourceHealth): boolean {
  return (
    a.state === b.state &&
    a.lastOkAt === b.lastOkAt &&
    a.lastError === b.lastError &&
    a.p50LatencyMs === b.p50LatencyMs &&
    a.lag === b.lag &&
    a.budget === b.budget
  )
}

const registry = createHealthRegistry()

export const healthRegistry: HealthRegistry = registry
export const setBudgetSnapshot = (net: NetworkId, snapshot: BudgetSnapshot | undefined): void =>
  registry.setBudget(net, snapshot)
export const resetHealthRegistry = (): void => registry.reset()
const subscribe = (cb: () => void): (() => void) => healthRegistry.subscribe(cb)

const ALL_SOURCES: SourceId[] = ['sdk', 'dapi', 'radar', 'pe', 'hyphen', 'rate']

export function useSourceHealth(source: SourceId): SourceHealth {
  const net = useSyncExternalStore(subscribeActiveNetwork, getActiveNetwork, getActiveNetwork)
  return useSyncExternalStore(
    subscribe,
    () => healthRegistry.get(net, source),
    () => healthRegistry.get(net, source),
  )
}

let allCache: { net: NetworkId; items: SourceHealth[] } | undefined

export function useAllSourceHealth(): SourceHealth[] {
  const net = useSyncExternalStore(subscribeActiveNetwork, getActiveNetwork, getActiveNetwork)
  return useSyncExternalStore(
    subscribe,
    () => {
      const items = ALL_SOURCES.map((s) => healthRegistry.get(net, s))
      if (
        allCache?.net === net &&
        allCache.items.length === items.length &&
        allCache.items.every((h, i) => h === items[i])
      ) {
        return allCache.items
      }
      allCache = { net, items }
      return items
    },
    () => allCache?.items ?? [],
  )
}
