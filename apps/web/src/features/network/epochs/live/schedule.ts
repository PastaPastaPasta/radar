import type { SourceStamp } from '@/data/envelope'
import { proposerTurns, type ValidatorSets } from '@/lib/proposer-order'

/** Rows the table shows. */
export const SHOWN = 12

/** One evonode's next turn: the Platform block it is due to propose. */
export interface Turn {
  protx: string
  height: number
}

/**
 * An order of turns read at one block. `dapi` is the validator sets one evonode reported (live); `radar` is the crawl's
 * last sample of the same (the cold start, and the fallback while DAPI does not answer).
 */
export interface ScheduleSeed {
  origin: 'dapi' | 'radar'
  /** The block the order was read at. */
  height: number
  /** When it was read: the block's time for DAPI, the sample's time for the crawl. */
  timeMs: number
  /** The proposer of that block, when the source names it (DAPI does, the crawl does not). */
  lastProposer?: string
  /** Ascending by height, every one above `height`. */
  turns: Turn[]
  stamp: SourceStamp
}

/** The newest Platform block seen. Its proposer is set only when a source named it for this very block. */
export interface Tip {
  height: number
  timeMs: number
  proposer?: string
}

export interface ScheduleState {
  seed?: ScheduleSeed
  tip?: Tip
  /** Bumped each time a newer block moves the list on. */
  rev: number
  /** Evonodes shown before the last move whose turns it passed, top first. */
  passed: string[]
}

export type ScheduleEvent =
  { type: 'tip'; height: number; timeMs: number } | { type: 'seed'; seed: ScheduleSeed }

export const initialSchedule: ScheduleState = { rev: 0, passed: [] }

export interface ScheduleRow {
  protx: string
  /** The block it is due to propose. */
  height: number
  /** Blocks from the newest one known: 1 is the next block. */
  away: number
}

/** The newest block the list counts from: the tip, or the seed's own block before any tip is known. */
export function baseHeight(state: ScheduleState): number | undefined {
  const seed = state.seed?.height
  const tip = state.tip?.height
  if (seed === undefined) return tip
  return tip === undefined ? seed : Math.max(seed, tip)
}

/** The next `SHOWN` turns after the newest block known. */
export function upcoming(state: ScheduleState, count = SHOWN): ScheduleRow[] {
  const base = baseHeight(state)
  if (!state.seed || base === undefined) return []
  const rows: ScheduleRow[] = []
  for (const t of state.seed.turns) {
    if (t.height <= base) continue
    rows.push({ protx: t.protx, height: t.height, away: t.height - base })
    if (rows.length === count) break
  }
  return rows
}

/** Blocks the list has been moved on since its order was read, assuming nobody missed a turn. */
export function movedOn(state: ScheduleState): number {
  const base = baseHeight(state)
  return state.seed && base !== undefined ? base - state.seed.height : 0
}

/** Which of the rows shown before a move are gone after it because their turn came. */
function passedBy(before: ScheduleRow[], after: ScheduleState): string[] {
  const base = baseHeight(after) ?? 0
  const still = new Set(upcoming(after).map((r) => r.protx))
  return before.filter((r) => r.height <= base && !still.has(r.protx)).map((r) => r.protx)
}

function moved(prev: ScheduleState, next: ScheduleState): ScheduleState {
  const before = upcoming(prev)
  const was = baseHeight(prev)
  const now = baseHeight(next)
  if (was === undefined || now === undefined || now <= was || prev.tip === undefined) {
    return { ...next, passed: [] }
  }
  return { ...next, rev: prev.rev + 1, passed: passedBy(before, next) }
}

/**
 * Seeds are kept newest first: a seed replaces the one in force only when it was read at a later block, or at the same
 * block from DAPI over the crawl. A DAPI seed ahead of the tip is a newer block seen, and names its proposer. A tip that
 * is not above the newest block seen (a repeat, or a node behind) changes nothing.
 */
export function reduceSchedule(state: ScheduleState, event: ScheduleEvent): ScheduleState {
  if (event.type === 'tip') {
    if (state.tip && event.height <= state.tip.height) return state
    const proposer =
      state.seed?.origin === 'dapi' && state.seed.height === event.height
        ? state.seed.lastProposer
        : undefined
    const tip: Tip = {
      height: event.height,
      timeMs: event.timeMs,
      ...(proposer ? { proposer } : {}),
    }
    return moved(state, { ...state, tip })
  }
  const { seed } = event
  const held = state.seed
  const newer =
    !held ||
    seed.height > held.height ||
    (seed.height === held.height && seed.origin === 'dapi' && held.origin === 'radar')
  if (!newer) return state
  let tip = state.tip
  if (seed.origin === 'dapi') {
    if (!tip || seed.height > tip.height) {
      tip = {
        height: seed.height,
        timeMs: seed.timeMs,
        ...(seed.lastProposer ? { proposer: seed.lastProposer } : {}),
      }
    } else if (seed.height === tip.height && seed.lastProposer) {
      tip = { ...tip, proposer: seed.lastProposer }
    }
  }
  return moved(state, { ...state, seed, ...(tip ? { tip } : {}) })
}

/** The live order from what one evonode reported about the validator sets. */
export function seedFromValidatorSets(
  sets: ValidatorSets,
  meta: { height: number; timeMs: number },
  stamp: SourceStamp,
): ScheduleSeed {
  return {
    origin: 'dapi',
    height: meta.height,
    timeMs: meta.timeMs,
    lastProposer: sets.lastProposer,
    turns: proposerTurns(sets).map((t) => ({ protx: t.proTxHash, height: meta.height + t.slot })),
    stamp,
  }
}

/** The crawl's schedule: each evonode's first turn as blocks after the block it sampled. */
export function seedFromCrawl(
  schedule: { height: number; ts: number; next: readonly { protx: string; slots: number }[] },
  stamp: SourceStamp,
): ScheduleSeed {
  const turns = schedule.next
    .map((n) => ({ protx: n.protx, height: schedule.height + n.slots }))
    .sort((a, b) => a.height - b.height)
  return { origin: 'radar', height: schedule.height, timeMs: schedule.ts, turns, stamp }
}

/** Typical seconds a block when nothing better is known: Radar's crawl falls back to the same. */
export const DEFAULT_BLOCK_MS = { mainnet: 140_000, other: 10_000 } as const

/** Fewer blocks than this into an epoch say little about its pace. */
const MIN_PACE_BLOCKS = 20

/**
 * The time a block takes: over the current epoch so far once it has some blocks (the crawl's rule), else what the
 * crawl last measured, else a typical value.
 */
export function blockInterval(opts: {
  epoch?: { firstBlockHeight: number; firstBlockTimeMs: number }
  tip?: Tip
  crawlBlockSecs?: number
  mainnet: boolean
}): number {
  const { epoch, tip } = opts
  if (epoch && tip && tip.height - epoch.firstBlockHeight > MIN_PACE_BLOCKS) {
    const ms = (tip.timeMs - epoch.firstBlockTimeMs) / (tip.height - epoch.firstBlockHeight)
    if (ms > 0 && Number.isFinite(ms)) return ms
  }
  if (opts.crawlBlockSecs !== undefined && opts.crawlBlockSecs > 0)
    return opts.crawlBlockSecs * 1000
  return opts.mainnet ? DEFAULT_BLOCK_MS.mainnet : DEFAULT_BLOCK_MS.other
}

/**
 * When each upcoming turn should come: the next block one interval after the newest (or now, once that is past), and
 * each later one an interval apart. An estimate, like the order it counts.
 */
export function etaOf(row: ScheduleRow, fromMs: number, blockMs: number, nowMs: number): number {
  const next = Math.max(fromMs + blockMs, nowMs)
  return next + (row.away - 1) * blockMs
}
