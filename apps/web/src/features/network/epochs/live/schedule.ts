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

/**
 * The newest Platform block a proof-checked read reached. Its proposer is set only when a validator-set answer named
 * the proposer of this very block.
 */
export interface Tip {
  height: number
  timeMs: number
  proposer?: string
}

export interface ScheduleState {
  /** The newest order of each origin that is still usable. */
  dapi?: ScheduleSeed
  radar?: ScheduleSeed
  /** The order in force: the newer of the two, DAPI on a tie. */
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

/**
 * How far an order may be read ahead of the newest proof-checked block. A node a block or two ahead of the one the SDK
 * asked is normal; one further ahead is not believed, so an unproved answer can never move the list on by itself.
 */
export const MAX_SEED_LEAD = 2

export interface ScheduleRow {
  protx: string
  /** The block it is due to propose. */
  height: number
  /** Blocks from the newest one known: 1 is the next block. */
  away: number
}

/** The block the list counts from: the proof-checked tip, or the order's own block before any tip is known. */
export function baseHeight(state: ScheduleState): number | undefined {
  return state.tip?.height ?? state.seed?.height
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
  return state.seed && base !== undefined ? Math.max(0, base - state.seed.height) : 0
}

/** Which of the rows shown before a move are gone after it because their turn came. */
function passedBy(before: ScheduleRow[], after: ScheduleState): string[] {
  const base = baseHeight(after) ?? 0
  const still = new Set(upcoming(after).map((r) => r.protx))
  return before.filter((r) => r.height <= base && !still.has(r.protx)).map((r) => r.protx)
}

const usable = (seed: ScheduleSeed | undefined, tip: Tip | undefined): boolean =>
  seed !== undefined && (tip === undefined || seed.height <= tip.height + MAX_SEED_LEAD)

/** Picks the order in force, and names the tip's proposer once a DAPI order read at that very block says who it was. */
function settle(state: ScheduleState): ScheduleState {
  const { dapi, radar } = state
  const seed = dapi && (!radar || dapi.height >= radar.height) ? dapi : radar
  let tip = state.tip
  if (tip && !tip.proposer && dapi?.height === tip.height && dapi.lastProposer)
    tip = { ...tip, proposer: dapi.lastProposer }
  return { ...state, ...(seed ? { seed } : {}), ...(tip ? { tip } : {}) }
}

/**
 * Only a proof-checked read moves the tip, and with it the list. A tip that is not above the newest one (a repeat, or a
 * node behind) changes nothing. An order is kept per origin, newest first, and only while it was read no more than
 * `MAX_SEED_LEAD` blocks past the tip: it places the turns but never moves the block the list counts from.
 */
export function reduceSchedule(state: ScheduleState, event: ScheduleEvent): ScheduleState {
  if (event.type === 'tip') {
    if (state.tip && event.height <= state.tip.height) return state
    const tip: Tip = { height: event.height, timeMs: event.timeMs }
    const next: ScheduleState = { ...state, tip }
    delete next.seed
    if (!usable(next.dapi, tip)) delete next.dapi
    if (!usable(next.radar, tip)) delete next.radar
    const settled = settle(next)
    const before = upcoming(state)
    if (state.tip === undefined) return { ...settled, passed: [] }
    return { ...settled, rev: state.rev + 1, passed: passedBy(before, settled) }
  }
  const { seed } = event
  if (!usable(seed, state.tip)) return state
  const held = seed.origin === 'dapi' ? state.dapi : state.radar
  if (held && seed.height <= held.height) return state
  return settle({ ...state, [seed.origin]: seed, passed: [] })
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
