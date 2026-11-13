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
    case 'signalling':
      return [
        { id: 'signal', block: d.ehf.block, done: true },
        { id: 'window-end', block: o.window_end, done: false },
        { id: 'lock-in', block: o.lock_in_if_reached, done: false },
        { id: 'activation', block: o.activation_if_reached, done: false },
      ]
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
  } else if (o.phase === 'signalling' && o.next_window && d.window?.attempt != null) {
    next = { start: o.next_window, attempt: d.window.attempt + 1 }
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
    o.phase === 'signalling' && o.next_window && d.window?.attempt != null
      ? [d.window.attempt + 1, o.next_window]
      : o.earliest_start
        ? [0, o.earliest_start]
        : undefined
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
