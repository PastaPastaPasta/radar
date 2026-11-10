import type { NetworkId } from '@/lib/network'
import type { BudgetSnapshot } from './budget'
import type { NodeInfo } from './discovery'
import type { RateLimitHeaders } from './grpc-web'

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
  private active: NodeSlot[] = []
  private readonly now: () => number
  private readonly random: () => number
  private readonly activeSize: number
  private bestTip = 0

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
      this.slots.set(node.url, {
        ...node,
        started: [],
        inFlight: 0,
        fullUntil: 0,
        benchedUntil: 0,
        strikes: 0,
        behindUntil: 0,
        everActive: false,
      })
    }
    this.fill()
  }

  /** A node asked for by URL (a node's own /mn/ page), added without joining the active set. */
  slotFor(url: string): NodeSlot | undefined {
    return this.slots.get(url)
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
    this.active = this.active.filter((s) => !this.isBenched(s, now) || s.inFlight > 0)
    if (this.active.length >= this.activeSize) return
    const fresh = shuffled(
      [...this.slots.values()].filter(
        (s) => !this.active.includes(s) && !this.isBenched(s, now) && !s.everActive,
      ),
      this.random,
    )
    // After every unused node has had a turn, recovered ones come back.
    const rested = shuffled(
      [...this.slots.values()].filter(
        (s) => !this.active.includes(s) && !this.isBenched(s, now) && s.everActive,
      ),
      this.random,
    )
    for (const s of [...fresh, ...rested]) {
      if (this.active.length >= this.activeSize) break
      s.everActive = true
      this.active.push(s)
    }
  }

  /** Nodes resting right now: they were active and are benched. */
  private resting(now: number): NodeSlot[] {
    return [...this.slots.values()].filter((s) => s.everActive && this.isBenched(s, now))
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
    opts: { exclude?: ReadonlySet<string>; heightSensitive?: boolean } = {},
  ): NodeSlot | undefined {
    const now = this.now()
    this.fill()
    let best: NodeSlot | undefined
    let bestHeadroom = -1
    for (const slot of this.active) {
      if (opts.exclude?.has(slot.url)) continue
      if (opts.heightSensitive && slot.behindUntil > now) continue
      if (!this.canTake(slot, now)) continue
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
  hasUsableNode(exclude?: ReadonlySet<string>): boolean {
    const now = this.now()
    this.fill()
    return [...this.slots.values()].some(
      (s) => !exclude?.has(s.url) && !(this.isBenched(s, now) && s.benchedUntil === SESSION),
    )
  }

  /** The soonest instant a full active node frees a slot or a resting one returns; undefined when nothing will. */
  nextChangeAt(): number | undefined {
    const now = this.now()
    let soonest: number | undefined
    const consider = (at: number) => {
      if (at > now && Number.isFinite(at) && (soonest === undefined || at < soonest)) soonest = at
    }
    for (const slot of [...this.slots.values()]) {
      if (this.isBenched(slot, now)) {
        consider(slot.benchedUntil)
        continue
      }
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
      rate.remaining < SERVER_FULL_BELOW ? this.now() + (rate.resetS ?? 60) * 1000 : 0
  }

  /** `ratelimit-reset` seconds, else 60 s. */
  benchRateLimited(slot: NodeSlot, rate: RateLimitHeaders): void {
    this.bench(slot, (rate.resetS ?? DEFAULT_RESET_MS / 1000) * 1000)
  }

  /** The node could not be reached at all (refused, TLS, CORS, DNS): out for the session. */
  benchUnreachable(slot: NodeSlot): void {
    this.bench(slot, SESSION)
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

  /** The node's own view of the tip. A node more than 2 blocks behind the best seen is left out of tip-sensitive calls for a while. */
  noteTip(slot: NodeSlot, height: number): void {
    slot.tipHeight = height
    if (height > this.bestTip) this.bestTip = height
    slot.behindUntil = height < this.bestTip - BEHIND_BLOCKS ? this.now() + BEHIND_HOLD_MS : 0
  }

  snapshot(): BudgetSnapshot {
    const now = this.now()
    this.fill()
    let headroom = 0
    for (const slot of this.active) headroom += this.headroomOf(slot, now)
    let used = 0
    for (const slot of this.slots.values()) {
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
