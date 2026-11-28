// The activation tracker's arithmetic, ported from dash-nodes' v24.js (MIT, github.com/PastaPastaPasta/dash-nodes).
import type {
  ActivationBlock,
  ActivationOutlook,
  ActivationWindow,
  RadarActivation,
  RadarActivationDeployment,
} from '@/data/radar/schemas'

/** A reading older than this is called stale (the collector reads every 30 s, the publisher every minute). */
export const STALE_AFTER_MS = 10 * 60_000

export type V24State = 'defined' | 'started' | 'locked_in' | 'active' | 'failed'

export const v24Of = (doc: RadarActivation): RadarActivationDeployment | undefined =>
  doc.deployments.find((d) => d.name === 'v24')

/** A block's time in ms; Radar sends Unix seconds. */
export const blockMs = (b: ActivationBlock | null | undefined): number | undefined =>
  b?.time == null ? undefined : b.time * 1000

/** Whether the deployment's outcome is settled: locked in, active, failed or timed out before it started. */
export const isDecided = (d: RadarActivationDeployment): boolean =>
  ['locked_in', 'active', 'failed'].includes(d.state) || d.outlook.phase === 'timed_out'

export interface Milestone {
  id: string
  block: ActivationBlock | null | undefined
  done: boolean
}

/** The road from here: each milestone's block (with its time or estimate) and whether it already happened. */
export function milestones(d: RadarActivationDeployment, o: ActivationOutlook): Milestone[] {
  const mined = !!d.ehf.height
  switch (o.phase) {
    case 'waiting_for_signal':
    case 'waiting_for_window':
      return [
        { id: 'start-time', block: o.start_time_block, done: !!o.start_time_reached },
        { id: 'signal', block: d.ehf.block, done: mined },
        { id: 'first-window', block: o.earliest_start, done: false },
        { id: 'lock-in', block: o.earliest_lock_in, done: false },
        { id: 'activation', block: o.earliest_activation, done: false },
      ]
    case 'signalling': {
      const signal = { id: 'signal', block: d.ehf.block, done: true }
      if (o.possible !== false)
        return [
          signal,
          { id: 'window-end', block: o.window_end, done: false },
          { id: 'lock-in', block: o.lock_in_if_reached, done: false },
          { id: 'activation', block: o.activation_if_reached, done: false },
        ]
      const n = o.next_attempt
      if (n === undefined)
        return [signal, { id: 'window-end-short', block: o.window_end, done: false }]
      if (n === null)
        return [
          signal,
          { id: 'window-end-last', block: o.window_end, done: false },
          { id: 'fails', block: o.next_window, done: false },
        ]
      return [
        signal,
        { id: 'window-end-short', block: o.window_end, done: false },
        { id: 'next-window-end', block: n.window_end, done: false },
        { id: 'lock-in', block: n.lock_in, done: false },
        { id: 'earliest-activation', block: n.activation, done: false },
      ]
    }
    case 'locked_in':
      return [
        { id: 'signal', block: d.ehf.block, done: true },
        { id: 'locked-in', block: { height: d.since, time: null, estimated: false }, done: true },
        {
          id: 'activation',
          block: o.activation,
          done: o.activation ? !o.activation.estimated : false,
        },
      ]
    case 'active':
      return [
        { id: 'signal', block: d.ehf.block, done: true },
        {
          id: 'locked-in',
          block: o.activation
            ? { height: o.activation.height - d.params.window, time: null, estimated: false }
            : null,
          done: true,
        },
        { id: 'active', block: o.activation, done: true },
      ]
    default:
      return []
  }
}

/** While signalling, the next window's attempt and first block, unless this window is the last before the timeout. */
function nextWindow(d: RadarActivationDeployment): [number, ActivationBlock] | undefined {
  const o = d.outlook
  if (o.phase !== 'signalling') return undefined
  if (o.next_attempt !== undefined)
    return o.next_attempt ? [o.next_attempt.attempt, o.next_attempt.window_start] : undefined
  return o.next_window && d.window?.attempt != null
    ? [d.window.attempt + 1, o.next_window]
    : undefined
}

export interface Slot {
  height: number
  time: number | undefined
  estimated: boolean
  attempt: number
  threshold: number
  count: number | null
  mined: number | null
  /** Still being counted. */
  current: boolean
  /** A window to come, dated by an estimate. */
  future: boolean
}

/** Every window that counted plus the ones to come, as the share of blocks that signalled against each threshold. */
export function windowSlots(d: RadarActivationDeployment, pace: number): Slot[] {
  const p = d.params
  const o = d.outlook
  const past = (d.windows ?? []).filter((w) => w.state === 'started' && w.threshold != null)
  const slots: Slot[] = past.map((w) => ({
    height: w.start.height,
    time: blockMs(w.start),
    estimated: !!w.start.estimated,
    attempt: w.attempt ?? 0,
    threshold: w.threshold ?? 0,
    count: w.count,
    mined: w.mined,
    current: w.mined < p.window,
    future: false,
  }))
  let next: { start: ActivationBlock; attempt: number } | undefined
  if ((o.phase === 'waiting_for_signal' || o.phase === 'waiting_for_window') && o.earliest_start) {
    next = { start: o.earliest_start, attempt: 0 }
  } else {
    const n = nextWindow(d)
    if (n) next = { start: n[1], attempt: n[0] }
  }
  if (next && d.schedule.length > 0) {
    for (let a = next.attempt, i = 0; i < 12; a++, i++) {
      const threshold = d.schedule[Math.min(a, d.schedule.length - 1)]!.threshold
      slots.push({
        height: next.start.height + i * p.window,
        time: next.start.time == null ? undefined : (next.start.time + i * p.window * pace) * 1000,
        estimated: true,
        attempt: a,
        threshold,
        count: null,
        mined: null,
        current: false,
        future: true,
      })
      if (threshold <= p.threshold_min) break
    }
  }
  return slots.slice(-24)
}

export interface WindowProgress {
  /** Cumulative signalling blocks after each mined block, from 0. */
  cumulative: number[]
  mined: number
  /** Where the current pace leads by the window's last block. */
  projected: number
}

/** The window's `signalling` string (`#` signalled, `-` did not) as a running count and a projection at this pace. */
export function windowProgress(w: ActivationWindow, size: number): WindowProgress {
  const marks = w.signalling ?? ''
  const cumulative = [0]
  for (const c of marks) cumulative.push(cumulative[cumulative.length - 1]! + (c === '#' ? 1 : 0))
  const mined = marks.length
  const rate = mined > 0 ? w.count / mined : 0
  return { cumulative, mined, projected: Math.round(w.count + rate * (size - mined)) }
}

export interface ThresholdRow {
  attempt: number
  threshold: number
  /** A gap in the numbering: the rows after it are the last windows that counted. */
  gap: boolean
  startHeight: number | undefined
  startTime: number | undefined
  estimated: boolean
  count: number | undefined
  mined: number | undefined
  now: boolean
}

/** The schedule's windows, then (on a network where it took longer) the last ones that counted. */
export function thresholdRows(d: RadarActivationDeployment, pace: number): ThresholdRow[] {
  const p = d.params
  const o = d.outlook
  const done = new Map(
    (d.windows ?? []).filter((w) => w.attempt != null).map((w) => [w.attempt!, w]),
  )
  const anchor: [number, ActivationBlock] | undefined =
    o.phase === 'signalling' ? nextWindow(d) : o.earliest_start ? [0, o.earliest_start] : undefined
  const beyond = [...done.keys()]
    .filter((a) => a >= d.schedule.length)
    .sort((a, b) => a - b)
    .slice(-3)
  const floor = d.schedule[d.schedule.length - 1]?.threshold ?? 0
  const all = [
    ...d.schedule.map((s) => ({ ...s, gap: false })),
    ...beyond.map((a) => ({
      attempt: a,
      threshold: floor,
      gap: a > d.schedule.length && a === beyond[0],
    })),
  ]
  return all.map((s) => {
    const w = done.get(s.attempt)
    const k = anchor ? s.attempt - anchor[0] : -1
    let startHeight: number | undefined
    let startTime: number | undefined
    let estimated = false
    if (w) {
      startHeight = w.start.height
      startTime = blockMs(w.start)
    } else if (!isDecided(d) && anchor && k >= 0) {
      startHeight = anchor[1].height + k * p.window
      startTime =
        anchor[1].time == null ? undefined : Math.round(anchor[1].time + k * p.window * pace) * 1000
      estimated = true
    }
    return {
      attempt: s.attempt,
      threshold: s.threshold,
      gap: s.gap,
      startHeight,
      startTime,
      estimated,
      count: w?.count,
      mined: w?.mined,
      now: d.window?.attempt === s.attempt && d.state === 'started',
    }
  })
}

/** The signalling share the outlook goes by: this window's once it has a day of blocks, else the last day's. */
export interface Pace {
  signalled: number
  blocks: number
  basis: 'window' | 'recent'
}

export function todaysPace(d: RadarActivationDeployment): Pace | undefined {
  const w = d.window
  if (d.state === 'started' && w && w.mined > 0 && w.mined >= d.recent.blocks) {
    return { signalled: w.count, blocks: w.mined, basis: 'window' }
  }
  return d.recent.blocks > 0
    ? { signalled: d.recent.count, blocks: d.recent.blocks, basis: 'recent' }
    : undefined
}

export const rateOf = (p: Pace): number => p.signalled / p.blocks

export type Verdict = 'reached' | 'on-track' | 'needs-more' | 'impossible'

export interface WindowOutlook {
  verdict: Verdict
  count: number
  mined: number
  remaining: number
  threshold: number
  needed: number
  /** Where `rate` leads by the window's last block. */
  projected: number
  endHeight: number
}

/** Whether the window being counted can still lock in, and whether it does at `rate`. */
export function windowOutlook(
  d: RadarActivationDeployment,
  rate: number,
): WindowOutlook | undefined {
  const w = d.window
  if (d.state !== 'started' || w?.threshold == null) return undefined
  const size = d.params.window
  const remaining = size - w.mined
  const needed = Math.max(0, w.threshold - w.count)
  const projected = Math.min(size, Math.floor(w.count + rate * remaining))
  const verdict: Verdict =
    needed === 0
      ? 'reached'
      : needed > remaining
        ? 'impossible'
        : projected >= w.threshold
          ? 'on-track'
          : 'needs-more'
  return {
    verdict,
    count: w.count,
    mined: w.mined,
    remaining,
    threshold: w.threshold,
    needed,
    projected,
    endHeight: w.start.height + size - 1,
  }
}

export interface LockInProjection {
  attempt: number
  threshold: number
  start: number
  end: number
  /** First block of the window after it, locked in. */
  lockIn: number
  /** First block of the window after that, active. */
  activation: number
}

/** A height's time in ms at the recent pace from the tip. */
export const estimateMs = (doc: RadarActivation, height: number): number =>
  doc.tip.time + (height - doc.tip.height) * doc.block_seconds * 1000

/** Why no window locks in at a pace: it is under the lowest threshold, or the timeout comes first. */
export interface NoLockIn {
  never: 'floor' | 'timeout'
}

/**
 * The first window that locks in if miners keep signalling at `rate`: the one being counted (by where its
 * pace leads), then each to come at that share of its blocks against its falling threshold. `never` when no
 * window does; undefined when no window is to be counted.
 */
export function projectLockIn(
  doc: RadarActivation,
  d: RadarActivationDeployment,
  rate: number,
): LockInProjection | NoLockIn | undefined {
  const p = d.params
  const o = d.outlook
  if (d.schedule.length === 0) return undefined
  const last = d.schedule.length - 1
  const at = (attempt: number, start: number): LockInProjection => ({
    attempt,
    threshold: d.schedule[Math.min(attempt, last)]!.threshold,
    start,
    end: start + p.window - 1,
    lockIn: start + p.window,
    activation: start + 2 * p.window,
  })
  const timedOut = (w: LockInProjection) => p.timeout != null && estimateMs(doc, w.end) >= p.timeout
  let attempt: number
  let start: number
  const now = windowOutlook(d, rate)
  if (now && d.window?.attempt != null) {
    const current = at(d.window.attempt, d.window.start.height)
    if (now.verdict === 'reached' || now.verdict === 'on-track') return current
    if (timedOut(current)) return { never: 'timeout' }
    attempt = current.attempt + 1
    start = current.start + p.window
  } else if (
    (o.phase === 'waiting_for_window' || o.phase === 'waiting_for_signal') &&
    o.earliest_start
  ) {
    attempt = 0
    start = o.earliest_start.height
  } else {
    return undefined
  }
  for (;;) {
    const w = at(attempt, start)
    if (Math.floor(rate * p.window) >= w.threshold) return w
    if (timedOut(w)) return { never: 'timeout' }
    if (attempt >= last || w.threshold <= p.threshold_min) return { never: 'floor' }
    attempt++
    start += p.window
  }
}

export const locksIn = (x: LockInProjection | NoLockIn | undefined): x is LockInProjection =>
  x !== undefined && !('never' in x)

export type PoolRow = NonNullable<NonNullable<RadarActivationDeployment['window']>['pools']>[number]

/**
 * How a pool signals across the window. Radar counts each pool's blocks but not where they fall, so a switch is read
 * off the window's `#`/`-` string, against the pool's own share of misses: `on` when every block since the window's
 * last miss signalled and, missing at its window rate, the pool would have missed several of them; `off` when it alone
 * misses, would have missed several blocks before its first miss at that rate, likely mined none since its last, and
 * signalled in about as many blocks as it mined before the first. Without a block string that matches the pools'
 * totals, no switch is called.
 */
export type PoolTrend =
  | { kind: 'all' | 'none' | 'partly' }
  /** Signalling in every block since `since`; the blocks before it include its misses. */
  | { kind: 'on'; since: number; streak: number }
  /** Signalled until `from`, the window's first miss, which is its own. */
  | { kind: 'off'; from: number; streak: number }

export interface PoolStanding {
  row: PoolRow
  trend: PoolTrend
}

/** Misses a pool would be expected to make in a stretch before a stretch without them is taken as a change. */
const SURE_MISSES = 5

export function poolStandings(w: ActivationWindow): PoolStanding[] {
  const pools = w.pools ?? []
  const marks = w.signalling ?? ''
  const ordered =
    w.mined > 0 &&
    marks.length === w.mined &&
    pools.reduce((n, r) => n + r.blocks, 0) === w.mined &&
    pools.reduce((n, r) => n + r.signalling, 0) === w.count
  const lastMiss = marks.lastIndexOf('-')
  const firstMiss = marks.indexOf('-')
  const tail = marks.length - 1 - lastMiss
  const holdouts = pools.filter((r) => r.blocks > r.signalling)
  return pools.map((row) => {
    const trend = (): PoolTrend => {
      if (row.signalling === row.blocks) return { kind: 'all' }
      if (row.signalling === 0) return { kind: 'none' }
      if (!ordered) return { kind: 'partly' }
      const share = row.blocks / w.mined
      const missRate = (row.blocks - row.signalling) / w.mined
      if (lastMiss >= 0 && tail * missRate >= SURE_MISSES) {
        return { kind: 'on', since: w.start.height + lastMiss + 1, streak: tail }
      }
      if (
        holdouts.length === 1 &&
        firstMiss * missRate >= SURE_MISSES &&
        tail * share < 1 &&
        row.signalling <= firstMiss * share * 1.25 + SURE_MISSES
      ) {
        return { kind: 'off', from: w.start.height + firstMiss, streak: marks.length - firstMiss }
      }
      return { kind: 'partly' }
    }
    return { row, trend: trend() }
  })
}

/** Whether a pool signals in its latest blocks, as far as the window shows. */
export const signalsNow = (t: PoolTrend): boolean => t.kind === 'all' || t.kind === 'on'

/**
 * The share of blocks that would signal if each pool kept signalling as it does now: all of a pool's share when it
 * signals now, none when it doesn't, and its window's ratio when that can't be told.
 */
export function currentRate(standings: readonly PoolStanding[]): number | undefined {
  const total = standings.reduce((a, s) => a + s.row.blocks, 0)
  if (total <= 0) return undefined
  const on = standings.reduce(
    (a, { row, trend }) =>
      a + (signalsNow(trend) ? row.blocks : trend.kind === 'partly' ? row.signalling : 0),
    0,
  )
  return on / total
}

export interface Segment {
  key: string
  name: string
  blocks: number
  on: boolean
  /** For the blocks that didn't signal from a pool that signals now: the block it signals in every block since. */
  since?: number
  /** For the signalling blocks of that pool: the same block. */
  now?: number
}

/** The whole share of the one pool that signals for some of its blocks, across its two segments. */
export interface Span {
  name: string
  blocks: number
  signalling: number
  left: number
  /** The block the pool signals in every block since, when it switched to signalling. */
  since?: number
}

/**
 * Pools that signal in every block first, then each pool's signalling blocks beside its blocks that didn't, so a pool
 * that signals for some reads as one span across the divide; pools that signal in none last. With one such pool, its
 * span. The blocker is the biggest stretch of blocks that didn't signal from a pool that doesn't signal now.
 */
export function layoutOf(
  standings: readonly PoolStanding[],
  untagged: string,
): { segments: Segment[]; span: Span | undefined; blocker: Segment | undefined } {
  const name = (s: PoolStanding) => s.row.pool ?? untagged
  const mixed = standings.filter((s) => s.row.signalling > 0 && s.row.signalling < s.row.blocks)
  const full = standings.filter((s) => s.row.signalling === s.row.blocks && s.row.blocks > 0)
  const none = standings
    .filter((s) => s.row.signalling === 0 && s.row.blocks > 0)
    .sort((a, b) => b.row.blocks - a.row.blocks)
  const yes = (s: PoolStanding): Omit<Segment, 'key'> => ({
    name: name(s),
    blocks: s.row.signalling,
    on: true,
    now: s.trend.kind === 'on' ? s.trend.since : undefined,
  })
  const no = (s: PoolStanding): Omit<Segment, 'key'> => ({
    name: name(s),
    blocks: s.row.blocks - s.row.signalling,
    on: false,
    since: s.trend.kind === 'on' ? s.trend.since : undefined,
  })
  const segments = [
    ...full.map(yes),
    ...mixed.map(yes),
    ...mixed.toReversed().map(no),
    ...none.map(no),
  ].map((x, i) => ({ ...x, key: String(i) }))
  const one = mixed.length === 1 ? mixed[0]! : undefined
  const span = one && {
    name: name(one),
    blocks: one.row.blocks,
    signalling: one.row.signalling,
    left: full.reduce((n, s) => n + s.row.blocks, 0),
    since: one.trend.kind === 'on' ? one.trend.since : undefined,
  }
  const blocker = segments
    .filter((x) => !x.on && x.since === undefined)
    .reduce<Segment | undefined>((big, x) => (big && big.blocks >= x.blocks ? big : x), undefined)
  return { segments, span, blocker }
}
