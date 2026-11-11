import { useSyncExternalStore } from 'react'
import { getRenderedNetwork, subscribeRenderedNetwork } from './active-network'
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
    /** Leave `latencyMs` out when the report is not the outcome of one round trip, such as a stream that broke. */
    r: {
      ok: boolean
      latencyMs?: number
      kind?: SourceErrorKind
      message?: string
      /** DAPI: the node a failure came from, and how many nodes the pool can use. `down` needs every one of them to have failed. */
      node?: string
      nodes?: number
    },
  ): void
  setLag(net: NetworkId, source: SourceId, lag: SourceHealth['lag']): void
  get(net: NetworkId, source: SourceId): SourceHealth
  subscribe(cb: () => void): () => void
}

type FailureKind = Exclude<SourceErrorKind, 'aborted'>

interface Call {
  ok: boolean
  at: number
  /** The failure came from one named node. */
  tagged?: boolean
  kind?: FailureKind
}

interface Tally {
  calls: Call[]
  latencies: number[]
  consecutiveDownFailures: number
  /** Nodes that failed since the last answer, with when. */
  failedNodes: Map<string, number>
  nodeCount?: number
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
/** DAPI is down when this many distinct nodes (the active set and its 8 replacements), or all it has, failed inside the window. */
const DOWN_NODES = 16
const DOWN_NODES_WINDOW_MS = 2 * 60_000
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

function isDownFailure(call: Call | undefined): boolean {
  return call !== undefined && !call.ok && DOWN_KINDS.has(call.kind ?? 'network')
}

/** The next instant after `now` at which `compute` would answer differently with no new report. */
function nextTimeBoundary(rec: Tally, now: number): number | undefined {
  const candidates: number[] = []
  if (rec.lastInvalidAt !== undefined) candidates.push(rec.lastInvalidAt + INVALID_MEMORY_MS + 1)
  if (rec.lastOkAt !== undefined && isDownFailure(rec.calls[rec.calls.length - 1])) {
    candidates.push(rec.lastOkAt + DOWN_SILENCE_MS + 1)
  }
  for (const at of rec.failedNodes.values()) candidates.push(at + DOWN_NODES_WINDOW_MS + 1)
  const future = candidates.filter((t) => t > now)
  return future.length > 0 ? Math.min(...future) : undefined
}

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

  const silent = rec.lastOkAt === undefined || now - rec.lastOkAt > DOWN_SILENCE_MS
  // One node's failures say nothing about the network: DAPI is down when the nodes it can use have all failed.
  const failedNodes = [...rec.failedNodes.values()].filter((at) => now - at <= DOWN_NODES_WINDOW_MS)
  if (
    rec.failedNodes.size > 0 &&
    failedNodes.length >= Math.min(DOWN_NODES, rec.nodeCount ?? DOWN_NODES)
  ) {
    health.state = 'down'
    return health
  }
  if (
    rec.consecutiveDownFailures >= DOWN_FAILURES ||
    (isDownFailure(lastCall) && !lastCall?.tagged && silent)
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

export function createHealthRegistry(now: () => number = () => Date.now()): HealthRegistry & {
  setBudget(net: NetworkId, snapshot: BudgetSnapshot | undefined): void
  reset(): void
} {
  const records = new Map<string, Tally>()
  const cache = new Map<string, SourceHealth>()
  const listeners = new Set<() => void>()
  let snapshotAt = now()
  let timer: ReturnType<typeof setTimeout> | undefined

  const keyOf = (net: NetworkId, source: SourceId) => `${net}\u0000${source}`

  const touch = (net: NetworkId, source: SourceId): Tally => {
    const key = keyOf(net, source)
    let rec = records.get(key)
    if (!rec) {
      rec = { calls: [], latencies: [], consecutiveDownFailures: 0, failedNodes: new Map() }
      records.set(key, rec)
    }
    return rec
  }

  const schedule = () => {
    clearTimeout(timer)
    timer = undefined
    let next: number | undefined
    for (const rec of records.values()) {
      const boundary = nextTimeBoundary(rec, snapshotAt)
      if (boundary !== undefined && (next === undefined || boundary < next)) next = boundary
    }
    if (next === undefined) return
    timer = setTimeout(changed, Math.max(0, next - now()))
    ;(timer as { unref?: () => void }).unref?.()
  }

  function changed(): void {
    snapshotAt = now()
    schedule()
    for (const cb of [...listeners]) cb()
  }

  return {
    report(net, source, r) {
      const rec = touch(net, source)
      const at = now()
      const kind = r.kind ?? 'network'
      const tagged = source === 'dapi' && !r.ok && r.node !== undefined
      rec.calls.push({
        ok: r.ok,
        at,
        kind: r.ok ? undefined : (kind as FailureKind),
        ...(tagged ? { tagged } : {}),
      })
      if (rec.calls.length > CALL_WINDOW) rec.calls.shift()
      if (r.latencyMs !== undefined) {
        rec.latencies.push(r.latencyMs)
        if (rec.latencies.length > LATENCY_WINDOW) rec.latencies.shift()
      }
      if (r.ok) {
        rec.consecutiveDownFailures = 0
        rec.failedNodes.clear()
        rec.lastOkAt = at
      } else {
        if (tagged) {
          if (DOWN_KINDS.has(kind)) {
            rec.failedNodes.set(r.node!, at)
            rec.nodeCount = r.nodes
          }
        } else if (DOWN_KINDS.has(kind)) rec.consecutiveDownFailures++
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
      const fresh = compute(net, source, records.get(key), snapshotAt)
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
  const net = useSyncExternalStore(subscribeRenderedNetwork, getRenderedNetwork, getRenderedNetwork)
  const snapshot = () => healthRegistry.get(net, source)
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

let allCache: { net: NetworkId; items: SourceHealth[] } | undefined

export function useAllSourceHealth(): SourceHealth[] {
  const net = useSyncExternalStore(subscribeRenderedNetwork, getRenderedNetwork, getRenderedNetwork)
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
