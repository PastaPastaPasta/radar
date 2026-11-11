import type { NetworkId } from '@/lib/network'
import type { BudgetSnapshot } from './budget'
import type { NodeInfo } from './discovery'
import { clampResetS, type RateLimitHeaders } from './grpc-web'

export const ACTIVE_SET_SIZE = 8
export const PER_NODE_LIMIT = 50
export const MAX_IN_FLIGHT = 4
const WINDOW_MS = 60_000
const SERVER_FULL_BELOW = 30
const DEFAULT_RESET_MS = 60_000
const EWMA_ALPHA = 0.3
const DEFAULT_LATENCY_MS = 300
const BEHIND_BLOCKS = 2
const BEHIND_HOLD_MS = 60_000
const STRIKES_BEFORE_LONG_BENCH = 3
const SHORT_BENCH_MS = 60_000
const LONG_BENCH_MS = 10 * 60_000
const NETWORK_BENCH_MS = [60_000, 5 * 60_000, 10 * 60_000]
/** Consecutive unreachable results, while other nodes answered, after which a node rests for the session. */
const NETWORK_STRIKES_FOR_SESSION = 5
const OK_SHARE = 0.5
const TIGHT_SHARE = 0.2
const TIGHT_BENCHED = 3
const EXHAUSTED_BENCHED = 6

export const SESSION = Infinity

export interface NodeSlot extends NodeInfo {
  /** Start times of the requests sent in the rolling window. */
  started: number[]
  inFlight: number
  /** The node said its window is nearly spent: no requests until then. */
  fullUntil: number
  benchedUntil: number
  strikes: number
  /** Consecutive times this node could not be reached; any answer clears it. */
  unreachable: number
  /** Dropped from the active set for good: a seed that the live list replaced. */
  retired?: boolean
  ewmaMs?: number
  tipHeight?: number
  behindUntil: number
  everActive: boolean
}

export interface NodePoolOptions {
  now?: () => number
  random?: () => number
  activeSize?: number
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * One network's nodes: the 8 that carry traffic (§4.2), what each may still be sent (§4.3) and who is resting (§4.4).
 * Pure bookkeeping over an injected clock; the transport decides what to do with a node.
 */
export class NodePool {
  private readonly slots = new Map<string, NodeSlot>()
  /** Nodes asked for by URL (a node's own /mn/ page): counted and limited like the rest, never part of the active set. */
  private readonly pinned = new Map<string, NodeSlot>()
  private active: NodeSlot[] = []
  /** The last time any node answered, to tell a node that is down from a client that is offline. */
  lastSuccessAt = 0
  private readonly now: () => number
  private readonly random: () => number
  private readonly activeSize: number

  constructor(
    readonly net: NetworkId,
    nodes: NodeInfo[],
    opts: NodePoolOptions = {},
  ) {
    this.now = opts.now ?? Date.now
    this.random = opts.random ?? Math.random
    this.activeSize = opts.activeSize ?? ACTIVE_SET_SIZE
    this.add(nodes)
    this.fill()
  }

  /** New candidates (a live refresh). They join the active set only as replacements. */
  add(nodes: NodeInfo[]): void {
    for (const node of nodes) {
      if (this.slots.has(node.url)) continue
      this.slots.set(node.url, this.newSlot(node))
    }
    this.fill()
  }

  private newSlot(node: NodeInfo): NodeSlot {
    return {
      ...node,
      started: [],
      inFlight: 0,
      fullUntil: 0,
      benchedUntil: 0,
      strikes: 0,
      unreachable: 0,
      behindUntil: 0,
      everActive: false,
    }
  }

  /** How many nodes this pool can choose from. */
  get size(): number {
    return this.slots.size
  }

  /**
   * The live list has arrived: nodes outside it (the bundled seeds) stop being chosen, so the load spreads over the
   * whole network instead of the same few dozen addresses. Requests already in flight finish.
   */
  adopt(live: NodeInfo[]): void {
    if (live.length === 0) return
    const liveUrls = new Set(live.map((n) => n.url))
    for (const slot of this.slots.values()) if (!liveUrls.has(slot.url)) slot.retired = true
    this.active = this.active.filter((s) => !s.retired || s.inFlight > 0)
    this.add(live)
  }

  /** The slot of a node that is asked for by URL. It is counted like any other but never joins the active set. */
  pinnedSlot(node: NodeInfo): NodeSlot {
    const known = this.slots.get(node.url)
    if (known) return known
    let slot = this.pinned.get(node.url)
    if (!slot) this.pinned.set(node.url, (slot = this.newSlot(node)))
    return slot
  }

  private isBenched(slot: NodeSlot, now = this.now()): boolean {
    return slot.benchedUntil > now
  }

  private prune(slot: NodeSlot, now: number): void {
    const cutoff = now - WINDOW_MS
    let drop = 0
    while (drop < slot.started.length && slot.started[drop]! <= cutoff) drop++
    if (drop > 0) slot.started.splice(0, drop)
  }

  /** Brings the active set back to size from unused, unbenched candidates. */
  private fill(): void {
    const now = this.now()
    this.active = this.active.filter(
      (s) => (!this.isBenched(s, now) && !s.retired) || s.inFlight > 0,
    )
    if (this.active.length >= this.activeSize) return
    const fresh = shuffled(
      [...this.slots.values()].filter(
        (s) => !this.active.includes(s) && !this.isBenched(s, now) && !s.everActive && !s.retired,
      ),
      this.random,
    )
    // After every unused node has had a turn, recovered ones come back.
    const rested = shuffled(
      [...this.slots.values()].filter(
        (s) => !this.active.includes(s) && !this.isBenched(s, now) && s.everActive && !s.retired,
      ),
      this.random,
    )
    for (const s of [...fresh, ...rested]) {
      if (this.active.length >= this.activeSize) break
      s.everActive = true
      this.active.push(s)
    }
  }

  /** A request another client sent to `host` at `at`: it uses the node's window like one of ours. */
  noteExternal(host: string, at: number): void {
    const slot = this.slotByHost(host)
    if (!slot) return
    const i = slot.started.findLastIndex((t) => t <= at)
    slot.started.splice(i + 1, 0, at)
  }

  slotByHost(host: string): NodeSlot | undefined {
    return this.slots.get(`https://${host}`)
  }

  /** Nodes resting right now: they were active and are benched. */
  private resting(now: number): NodeSlot[] {
    return [...this.slots.values()].filter(
      (s) => s.everActive && !s.retired && this.isBenched(s, now),
    )
  }

  private headroomOf(slot: NodeSlot, now: number): number {
    if (this.isBenched(slot, now) || slot.fullUntil > now) return 0
    this.prune(slot, now)
    return Math.max(0, PER_NODE_LIMIT - slot.started.length)
  }

  private canTake(slot: NodeSlot, now: number): boolean {
    return slot.inFlight < MAX_IN_FLIGHT && this.headroomOf(slot, now) > 0
  }

  /**
   * The node with the most headroom, then the lowest latency. A node that is behind the best tip is skipped
   * for calls that depend on the tip. Returns nothing when every node is full or resting.
   */
  pick(
    opts: {
      exclude?: ReadonlySet<string>
      heightSensitive?: boolean
      only?: NodeSlot
      prefer?: string
    } = {},
  ): NodeSlot | undefined {
    const now = this.now()
    this.fill()
    let best: NodeSlot | undefined
    let bestHeadroom = -1
    const preferred = opts.prefer ? this.slots.get(opts.prefer) : undefined
    const candidates = opts.only
      ? [opts.only]
      : preferred && this.active.includes(preferred)
        ? [preferred, ...this.active]
        : this.active
    for (const slot of candidates) {
      const usable =
        !slot.retired &&
        !opts.exclude?.has(slot.url) &&
        !(opts.heightSensitive && slot.behindUntil > now) &&
        this.canTake(slot, now)
      if (slot === preferred && !opts.only) {
        if (usable) return slot
        continue
      }
      if (!usable) continue
      const headroom = this.headroomOf(slot, now)
      const better =
        headroom > bestHeadroom ||
        (headroom === bestHeadroom &&
          (slot.ewmaMs ?? DEFAULT_LATENCY_MS) < (best?.ewmaMs ?? DEFAULT_LATENCY_MS))
      if (better) {
        best = slot
        bestHeadroom = headroom
      }
    }
    return best
  }

  /** True when some node outside `exclude` is not resting for good, so waiting for capacity can end. */
  hasUsableNode(exclude?: ReadonlySet<string>, only?: NodeSlot): boolean {
    const now = this.now()
    this.fill()
    const mayReturn = (s: NodeSlot) =>
      !exclude?.has(s.url) && !(this.isBenched(s, now) && s.benchedUntil === SESSION)
    if (only) return mayReturn(only)
    return [...this.slots.values()].some((s) => !s.retired && mayReturn(s))
  }

  /** The soonest instant a full active node frees a slot or a resting one returns; undefined when nothing will. */
  nextChangeAt(): number | undefined {
    const now = this.now()
    let soonest: number | undefined
    const consider = (at: number) => {
      if (at > now && Number.isFinite(at) && (soonest === undefined || at < soonest)) soonest = at
    }
    for (const slot of [...this.slots.values(), ...this.pinned.values()]) {
      if (this.isBenched(slot, now)) {
        consider(slot.benchedUntil)
        continue
      }
      consider(slot.behindUntil)
      if (slot.fullUntil > now) consider(slot.fullUntil)
      this.prune(slot, now)
      if (slot.started.length >= PER_NODE_LIMIT) consider(slot.started[0]! + WINDOW_MS)
    }
    return soonest
  }

  begin(slot: NodeSlot): void {
    slot.started.push(this.now())
    slot.inFlight++
  }

  end(slot: NodeSlot): void {
    slot.inFlight = Math.max(0, slot.inFlight - 1)
  }

  succeeded(slot: NodeSlot, latencyMs: number, rate: RateLimitHeaders): void {
    slot.strikes = 0
    slot.unreachable = 0
    this.lastSuccessAt = this.now()
    slot.ewmaMs =
      slot.ewmaMs === undefined
        ? latencyMs
        : EWMA_ALPHA * latencyMs + (1 - EWMA_ALPHA) * slot.ewmaMs
    this.noteRate(slot, rate)
  }

  /** The node's own count of this client's requests (§4.3 "server truth"). */
  noteRate(slot: NodeSlot, rate: RateLimitHeaders): void {
    if (rate.remaining === undefined) return
    slot.fullUntil =
      rate.remaining < SERVER_FULL_BELOW ? this.now() + clampResetS(rate.resetS ?? 60) * 1000 : 0
  }

  /** `ratelimit-reset` seconds, else 60 s. */
  benchRateLimited(slot: NodeSlot, rate: RateLimitHeaders): void {
    this.bench(slot, clampResetS(rate.resetS ?? DEFAULT_RESET_MS / 1000) * 1000)
  }

  /**
   * The node could not be reached (refused, TLS, CORS, DNS, a dropped connection). The browser cannot tell that from
   * its own link going away, so the node rests for 1, then 5, then 10 minutes, and for the session only after five
   * misses in a row while other nodes were answering.
   */
  benchUnreachable(slot: NodeSlot): void {
    slot.unreachable++
    const others = this.lastSuccessAt > 0 && this.now() - this.lastSuccessAt < LONG_BENCH_MS
    if (slot.unreachable >= NETWORK_STRIKES_FOR_SESSION && others) {
      this.bench(slot, SESSION)
      return
    }
    this.bench(slot, NETWORK_BENCH_MS[Math.min(slot.unreachable, NETWORK_BENCH_MS.length) - 1]!)
  }

  /** UNAVAILABLE, DEADLINE_EXCEEDED, 5xx, timeout: 60 s, then 10 min once it has struck three times in a row. */
  benchFailing(slot: NodeSlot): void {
    slot.strikes++
    this.bench(slot, slot.strikes >= STRIKES_BEFORE_LONG_BENCH ? LONG_BENCH_MS : SHORT_BENCH_MS)
  }

  private bench(slot: NodeSlot, ms: number): void {
    const until = ms === SESSION ? SESSION : this.now() + ms
    slot.benchedUntil = Math.max(slot.benchedUntil, until)
    this.fill()
  }

  /** The lower middle of the tips the nodes report, so one node claiming a huge height cannot make the honest ones look behind. */
  private medianTip(): number {
    const tips = [...this.slots.values()]
      .map((s) => s.tipHeight)
      .filter((h): h is number => h !== undefined)
      .sort((a, b) => a - b)
    return tips.length === 0 ? 0 : tips[(tips.length - 1) >> 1]!
  }

  /** The node's own view of the tip. A node more than 2 blocks behind the middle one is left out of tip-sensitive calls for a while. */
  noteTip(slot: NodeSlot, height: number): void {
    slot.tipHeight = height
    if (this.pinned.get(slot.url) === slot) return
    slot.behindUntil = height < this.medianTip() - BEHIND_BLOCKS ? this.now() + BEHIND_HOLD_MS : 0
  }

  snapshot(): BudgetSnapshot {
    const now = this.now()
    this.fill()
    let headroom = 0
    for (const slot of this.active) headroom += this.headroomOf(slot, now)
    let used = 0
    for (const slot of [...this.slots.values(), ...this.pinned.values()]) {
      this.prune(slot, now)
      used += slot.started.length
    }
    const capacity = this.active.length * PER_NODE_LIMIT
    const benched = this.resting(now).length
    return {
      pressure: pressureOf(headroom, capacity, benched),
      headroom,
      capacity,
      benched,
      usedLastMinute: used,
    }
  }

  /** True if `n` more requests leave the pool at `ok` (§4.3). */
  canAfford(n: number): boolean {
    const s = this.snapshot()
    return s.pressure === 'ok' && s.headroom - n >= OK_SHARE * s.capacity
  }
}

export function pressureOf(
  headroom: number,
  capacity: number,
  benched: number,
): BudgetSnapshot['pressure'] {
  if (capacity === 0 || headroom < TIGHT_SHARE * capacity || benched >= EXHAUSTED_BENCHED) {
    return 'exhausted'
  }
  if (headroom < OK_SHARE * capacity || benched >= TIGHT_BENCHED) return 'tight'
  return 'ok'
}
