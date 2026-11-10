import { fromBinary } from '@bufbuild/protobuf'
import { SourceError, isSourceError, type SourceErrorKind } from '../errors'
import { healthRegistry, setBudgetSnapshot } from '../health'
import type { DevnetConfig, NetworkId } from '@/lib/network'
import type { Budget, BudgetSnapshot } from './budget'
import { discoverNodes, nodeFromHost, type NodeListStore } from './discovery'
import {
  GetBestBlockHeightResponseSchema,
  GetBlockchainStatusResponseSchema,
} from './gen/core/v0/core_pb'
import { isAnswerStatus, openCall, unaryCall, type FetchLike } from './grpc-web'
import { ACTIVE_SET_SIZE, NodePool, PER_NODE_LIMIT, type NodeSlot } from './nodes'
import type {
  DapiCallOptions,
  DapiPriority,
  DapiStreamHandle,
  DapiStreamMethod,
  DapiTransport,
  DapiUnaryMethod,
  DapiUnaryReply,
} from './transport'

export const HEDGE_AFTER_MS = 1_500
export const ATTEMPT_TIMEOUT_MS = 8_000
export const MAX_ATTEMPTS = 3
export const QUEUE_TIMEOUT_MS = 70_000
export const STREAM_OPEN_TIMEOUT_MS = 10_000
/** Envoy cuts every stream at 601 s; ending near that is the server's doing, not a fault. */
const EXPECTED_STREAM_LIFETIME_MS = 590_000
const PUBLISH_EVERY_MS = 5_000

const PRIORITY_ORDER: Record<DapiPriority, number> = { detail: 0, list: 1, prefetch: 2 }
const HEIGHT_SENSITIVE: ReadonlySet<string> = new Set([
  'getBestBlockHeight',
  'getBlockchainStatus',
  'getBlock',
  'subscribeToBlockHeadersWithChainLocks',
])

export interface HealthSink {
  report(
    net: NetworkId,
    source: 'dapi',
    r: { ok: boolean; latencyMs?: number; kind?: SourceErrorKind; message?: string },
  ): void
  setBudget(net: NetworkId, snapshot: BudgetSnapshot): void
}

export interface PoolTransportDeps {
  fetch: FetchLike
  now: () => number
  random: () => number
  devnets: () => readonly DevnetConfig[]
  nodeStore?: NodeListStore
  health: HealthSink
}

const defaultDeps = (): PoolTransportDeps => ({
  fetch: (input, init) => fetch(input, init),
  now: Date.now,
  random: Math.random,
  devnets: () => [],
  health: {
    report: (net, source, r) => healthRegistry.report(net, source, r),
    setBudget: (net, snapshot) => setBudgetSnapshot(net, snapshot),
  },
})

interface Waiter {
  priority: number
  seq: number
  tried: ReadonlySet<string>
  heightSensitive: boolean
  signal?: AbortSignal
  resolve(slot: NodeSlot): void
  reject(error: unknown): void
  cleanup(): void
}

interface NetState {
  pool?: Promise<NodePool>
  ready?: NodePool
  waiters: Waiter[]
  timer?: ReturnType<typeof setTimeout>
  lastPublished?: BudgetSnapshot
}

function abortError(): SourceError {
  return new SourceError({ source: 'dapi', kind: 'aborted', message: 'The request was aborted' })
}

function failureKind(e: unknown): SourceErrorKind {
  return isSourceError(e) ? e.kind : 'network'
}

function isAnswer(e: unknown): boolean {
  return isSourceError(e) && e.kind === 'http' && e.status !== undefined && isAnswerStatus(e.status)
}

function sameSnapshot(a: BudgetSnapshot | undefined, b: BudgetSnapshot): boolean {
  return (
    a?.pressure === b.pressure &&
    a.headroom === b.headroom &&
    a.capacity === b.capacity &&
    a.benched === b.benched &&
    a.usedLastMinute === b.usedLastMinute
  )
}

/** What the budget reports before a network's nodes are known: plenty of room, so a first call isn't sent to Hyphen. */
const OPTIMISTIC: BudgetSnapshot = {
  pressure: 'ok',
  headroom: ACTIVE_SET_SIZE * PER_NODE_LIMIT,
  capacity: ACTIVE_SET_SIZE * PER_NODE_LIMIT,
  benched: 0,
  usedLastMinute: 0,
}

/**
 * The production `DapiTransport`: gRPC-web over fetch to a rotating set of evonodes (§4.1–§4.4).
 * Requests wait in a priority queue for budget, hedge to a second node after 1.5 s while pressure is `ok`,
 * retry on distinct nodes, and bench the nodes that fail or rate-limit.
 */
export class PoolDapiTransport implements DapiTransport {
  readonly budget: Budget
  private readonly deps: PoolTransportDeps
  private readonly nets = new Map<NetworkId, NetState>()
  private readonly listeners = new Set<() => void>()
  private seq = 0
  private ticker: ReturnType<typeof setInterval> | undefined

  constructor(deps: Partial<PoolTransportDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps }
    this.budget = {
      snapshot: (net) => this.nets.get(net)?.ready?.snapshot() ?? OPTIMISTIC,
      canAfford: (net, n) => {
        const ready = this.nets.get(net)?.ready
        return ready ? ready.canAfford(n) : n <= OPTIMISTIC.headroom - OPTIMISTIC.capacity / 2
      },
      subscribe: (cb) => {
        this.listeners.add(cb)
        return () => this.listeners.delete(cb)
      },
    }
  }

  private state(net: NetworkId): NetState {
    let s = this.nets.get(net)
    if (!s) this.nets.set(net, (s = { waiters: [] }))
    return s
  }

  private poolFor(net: NetworkId): Promise<NodePool> {
    const state = this.state(net)
    state.pool ??= discoverNodes(net, {
      fetch: this.deps.fetch,
      now: this.deps.now,
      store: this.deps.nodeStore,
      devnets: this.deps.devnets,
    }).then(
      (found) => {
        const pool = new NodePool(net, found.nodes, {
          now: this.deps.now,
          random: this.deps.random,
        })
        state.ready = pool
        void found.refreshed?.then((live) => {
          if (live) pool.add(live)
          this.publish(net)
        })
        this.startTicker()
        return pool
      },
      (e: unknown) => {
        state.pool = undefined
        this.deps.health.report(net, 'dapi', {
          ok: false,
          kind: failureKind(e),
          message: e instanceof Error ? e.message : undefined,
        })
        throw e
      },
    )
    return state.pool
  }

  // ---- budget publication ---------------------------------------------------

  private startTicker(): void {
    if (this.ticker) return
    this.ticker = setInterval(() => {
      for (const net of this.nets.keys()) this.publish(net)
    }, PUBLISH_EVERY_MS)
    ;(this.ticker as { unref?: () => void }).unref?.()
  }

  private publish(net: NetworkId): void {
    const state = this.nets.get(net)
    const pool = state?.ready
    if (!state || !pool) return
    const snapshot = pool.snapshot()
    if (sameSnapshot(state.lastPublished, snapshot)) return
    state.lastPublished = snapshot
    this.deps.health.setBudget(net, snapshot)
    for (const cb of [...this.listeners]) cb()
  }

  // ---- queue ------------------------------------------------------------------

  private acquire(
    net: NetworkId,
    pool: NodePool,
    opts: {
      priority: DapiPriority
      tried: ReadonlySet<string>
      heightSensitive: boolean
      signal?: AbortSignal
    },
  ): Promise<NodeSlot> {
    const state = this.state(net)
    return new Promise<NodeSlot>((resolve, reject) => {
      if (opts.signal?.aborted) return reject(abortError())
      const waiter: Waiter = {
        priority: PRIORITY_ORDER[opts.priority],
        seq: this.seq++,
        tried: opts.tried,
        heightSensitive: opts.heightSensitive,
        signal: opts.signal,
        resolve,
        reject,
        cleanup: () => undefined,
      }
      const timeout = setTimeout(() => {
        this.removeWaiter(state, waiter)
        reject(
          new SourceError({
            source: 'dapi',
            kind: 'rate-limited',
            message: 'The DAPI request budget is spent; the request gave up waiting',
          }),
        )
      }, QUEUE_TIMEOUT_MS)
      const onAbort = () => {
        this.removeWaiter(state, waiter)
        reject(abortError())
      }
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      waiter.cleanup = () => {
        clearTimeout(timeout)
        opts.signal?.removeEventListener('abort', onAbort)
      }
      state.waiters.push(waiter)
      state.waiters.sort((a, b) => a.priority - b.priority || a.seq - b.seq)
      this.pump(net, pool)
    })
  }

  private removeWaiter(state: NetState, waiter: Waiter): void {
    waiter.cleanup()
    const i = state.waiters.indexOf(waiter)
    if (i >= 0) state.waiters.splice(i, 1)
  }

  /** Hands free nodes to waiting requests in priority order; whatever is left waits for the next freed slot or window expiry. */
  private pump(net: NetworkId, pool: NodePool): void {
    const state = this.state(net)
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
    for (const waiter of [...state.waiters]) {
      const slot = pool.pick({ exclude: waiter.tried, heightSensitive: waiter.heightSensitive })
      if (slot) {
        this.removeWaiter(state, waiter)
        pool.begin(slot)
        waiter.resolve(slot)
        continue
      }
      if (!pool.hasUsableNode(waiter.tried)) {
        this.removeWaiter(state, waiter)
        waiter.reject(
          new SourceError({
            source: 'dapi',
            kind: 'network',
            message: 'No DAPI node is left to try',
          }),
        )
      }
    }
    if (state.waiters.length > 0) {
      const at = pool.nextChangeAt()
      if (at !== undefined) {
        state.timer = setTimeout(() => this.pump(net, pool), Math.max(1, at - this.deps.now() + 5))
        ;(state.timer as { unref?: () => void }).unref?.()
      }
    }
    this.publish(net)
  }

  // ---- one request to one node ---------------------------------------------

  private link(signal: AbortSignal | undefined, ctrl: AbortController): () => void {
    if (!signal) return () => undefined
    if (signal.aborted) {
      ctrl.abort(signal.reason)
      return () => undefined
    }
    const onAbort = () => ctrl.abort(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    return () => signal.removeEventListener('abort', onAbort)
  }

  private learnTip(pool: NodePool, slot: NodeSlot, method: string, response: Uint8Array): void {
    try {
      if (method === 'getBestBlockHeight') {
        pool.noteTip(slot, fromBinary(GetBestBlockHeightResponseSchema, response).height)
      } else if (method === 'getBlockchainStatus') {
        const blocks = fromBinary(GetBlockchainStatusResponseSchema, response).chain?.blocksCount
        if (blocks !== undefined) pool.noteTip(slot, blocks)
      }
    } catch {
      // A reply the façade can't read is reported by the façade.
    }
  }

  /** Records a failed attempt against its node: what to bench, what to report. */
  private failed(
    net: NetworkId,
    pool: NodePool,
    slot: NodeSlot,
    e: unknown,
    latencyMs?: number,
  ): void {
    const kind = failureKind(e)
    if (kind === 'aborted') return
    if (isAnswer(e)) {
      pool.succeeded(slot, latencyMs ?? 0, {})
      this.deps.health.report(net, 'dapi', { ok: true, latencyMs })
      return
    }
    if (kind === 'rate-limited') {
      const reset = isSourceError(e) ? e.retryAfterMs : undefined
      pool.benchRateLimited(slot, reset === undefined ? {} : { resetS: reset / 1000 })
    } else if (kind === 'network') pool.benchUnreachable(slot)
    else pool.benchFailing(slot)
    this.deps.health.report(net, 'dapi', {
      ok: false,
      kind,
      message: e instanceof Error ? e.message : undefined,
    })
  }

  /** The slot is already counted (`begin`); this sends, then settles the node's books. */
  private async send(
    net: NetworkId,
    pool: NodePool,
    slot: NodeSlot,
    method: DapiUnaryMethod,
    request: Uint8Array,
    signal: AbortSignal,
  ): Promise<DapiUnaryReply> {
    const ctrl = new AbortController()
    const unlink = this.link(signal, ctrl)
    const timeout = setTimeout(
      () => ctrl.abort(new DOMException('The node did not answer in time', 'TimeoutError')),
      ATTEMPT_TIMEOUT_MS,
    )
    const started = this.deps.now()
    try {
      const { response, rate } = await unaryCall({
        baseUrl: slot.url,
        method,
        request,
        signal: ctrl.signal,
        fetch: this.deps.fetch,
      })
      const latency = this.deps.now() - started
      pool.succeeded(slot, latency, rate)
      this.learnTip(pool, slot, method, response)
      this.deps.health.report(net, 'dapi', { ok: true, latencyMs: latency })
      return { response, node: slot.host }
    } catch (e) {
      this.failed(net, pool, slot, e, this.deps.now() - started)
      throw e
    } finally {
      clearTimeout(timeout)
      unlink()
      pool.end(slot)
      this.pump(net, pool)
    }
  }

  /** One attempt: the first node, and a hedge to a second when the first is slow and pressure is `ok`. */
  private attempt(
    net: NetworkId,
    pool: NodePool,
    first: NodeSlot,
    tried: Set<string>,
    method: DapiUnaryMethod,
    request: Uint8Array,
    heightSensitive: boolean,
    signal: AbortSignal | undefined,
    mayHedge: boolean,
  ): Promise<DapiUnaryReply> {
    return new Promise<DapiUnaryReply>((resolve, rejectWith) => {
      const reject = rejectWith as (reason: unknown) => void
      const flights: AbortController[] = []
      let settled = false
      let failures = 0
      let lastError: unknown
      let hedgeTimer: ReturnType<typeof setTimeout> | undefined

      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(hedgeTimer)
        for (const f of flights) f.abort(abortError())
        fn()
      }
      const launch = (slot: NodeSlot) => {
        const ctrl = new AbortController()
        flights.push(ctrl)
        const unlink = this.link(signal, ctrl)
        this.send(net, pool, slot, method, request, ctrl.signal).then(
          (reply) => {
            unlink()
            settle(() => resolve(reply))
          },
          (e: unknown) => {
            unlink()
            failures++
            lastError = e
            if (isAnswer(e) || failureKind(e) === 'aborted' || signal?.aborted) {
              settle(() => reject(e))
            } else if (failures >= flights.length) {
              settle(() => reject(lastError))
            }
          },
        )
      }
      launch(first)
      if (mayHedge) {
        hedgeTimer = setTimeout(() => {
          hedgeTimer = undefined
          if (settled || pool.snapshot().pressure !== 'ok') return
          const second = pool.pick({ exclude: tried, heightSensitive })
          if (!second) return
          tried.add(second.url)
          pool.begin(second)
          launch(second)
        }, HEDGE_AFTER_MS)
        ;(hedgeTimer as { unref?: () => void }).unref?.()
      }
    })
  }

  async unary(
    net: NetworkId,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts: DapiCallOptions = {},
  ): Promise<DapiUnaryReply> {
    if (opts.signal?.aborted) throw abortError()
    const pool = await this.poolFor(net)
    const heightSensitive = HEIGHT_SENSITIVE.has(method)

    if (opts.nodeUrl) return this.unaryToNode(net, pool, method, request, opts)

    const tried = new Set<string>()
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let slot: NodeSlot
      try {
        slot = await this.acquire(net, pool, {
          priority: opts.priority ?? 'detail',
          tried,
          heightSensitive,
          signal: opts.signal,
        })
      } catch (e) {
        throw lastError ?? e
      }
      tried.add(slot.url)
      try {
        return await this.attempt(
          net,
          pool,
          slot,
          tried,
          method,
          request,
          heightSensitive,
          opts.signal,
          true,
        )
      } catch (e) {
        if (isAnswer(e) || failureKind(e) === 'aborted' || opts.signal?.aborted) throw e
        lastError = e
      }
    }
    throw lastError
  }

  private async unaryToNode(
    net: NetworkId,
    pool: NodePool,
    method: DapiUnaryMethod,
    request: Uint8Array,
    opts: DapiCallOptions,
  ): Promise<DapiUnaryReply> {
    const node = nodeFromHost(opts.nodeUrl!)
    if (!node) {
      throw new SourceError({
        source: 'dapi',
        kind: 'invalid-response',
        message: 'Not a node address',
      })
    }
    pool.add([node])
    const slot = pool.slotFor(node.url)!
    pool.begin(slot)
    const ctrl = new AbortController()
    const unlink = this.link(opts.signal, ctrl)
    try {
      return await this.send(net, pool, slot, method, request, ctrl.signal)
    } finally {
      unlink()
    }
  }

  // ---- streams ----------------------------------------------------------------

  stream(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts: DapiCallOptions = {},
  ): DapiStreamHandle {
    let node: string | undefined
    return {
      get node() {
        return node
      },
      messages: this.streamMessages(net, method, request, opts, (n) => {
        node = n
      }),
    }
  }

  private async *streamMessages(
    net: NetworkId,
    method: DapiStreamMethod,
    request: Uint8Array,
    opts: DapiCallOptions,
    onNode: (node: string) => void,
  ): AsyncGenerator<Uint8Array> {
    if (opts.signal?.aborted) throw abortError()
    const pool = await this.poolFor(net)
    const avoided = new Set<string>(opts.avoidNode ? [`https://${opts.avoidNode}`] : [])
    const tried = pool.hasUsableNode(avoided) ? avoided : new Set<string>()
    let lastError: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let slot: NodeSlot
      try {
        slot = await this.acquire(net, pool, {
          priority: opts.priority ?? 'detail',
          tried,
          heightSensitive: HEIGHT_SENSITIVE.has(method),
          signal: opts.signal,
        })
      } catch (e) {
        throw lastError ?? e
      }
      tried.add(slot.url)
      const ctrl = new AbortController()
      const unlink = this.link(opts.signal, ctrl)
      const timeout = setTimeout(
        () => ctrl.abort(new DOMException('The node did not answer in time', 'TimeoutError')),
        STREAM_OPEN_TIMEOUT_MS,
      )
      const started = this.deps.now()
      let call: Awaited<ReturnType<typeof openCall>>
      try {
        call = await openCall({
          baseUrl: slot.url,
          method,
          request,
          signal: ctrl.signal,
          fetch: this.deps.fetch,
        })
      } catch (e) {
        unlink()
        this.failed(net, pool, slot, e, this.deps.now() - started)
        lastError = e
        if (isAnswer(e) || failureKind(e) === 'aborted' || opts.signal?.aborted) throw e
        continue
      } finally {
        clearTimeout(timeout)
        pool.end(slot)
        this.pump(net, pool)
      }
      const latency = this.deps.now() - started
      pool.succeeded(slot, latency, call.rate)
      this.deps.health.report(net, 'dapi', { ok: true, latencyMs: latency })
      onNode(slot.host)
      yield* this.readStream(net, pool, slot, call.messages, ctrl, unlink, opts.signal)
      return
    }
    throw lastError
  }

  private async *readStream(
    net: NetworkId,
    pool: NodePool,
    slot: NodeSlot,
    messages: AsyncGenerator<Uint8Array>,
    ctrl: AbortController,
    unlink: () => void,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<Uint8Array> {
    const openedAt = this.deps.now()
    try {
      for await (const message of messages) {
        if (signal?.aborted) throw abortError()
        yield message
      }
    } catch (e) {
      if (signal?.aborted) throw abortError()
      const lived = this.deps.now() - openedAt
      if (lived < EXPECTED_STREAM_LIFETIME_MS && failureKind(e) !== 'aborted') {
        pool.benchFailing(slot)
        this.deps.health.report(net, 'dapi', {
          ok: false,
          kind: failureKind(e),
          message: e instanceof Error ? e.message : undefined,
        })
      }
      throw e
    } finally {
      unlink()
      ctrl.abort(abortError())
    }
  }
}
