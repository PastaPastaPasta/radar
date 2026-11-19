import { describe, expect, it } from 'vitest'
import type { SourceStamp } from '@/data/envelope'
import type { ValidatorSets } from '@/lib/proposer-order'
import {
  blockInterval,
  etaOf,
  initialSchedule,
  movedOn,
  reduceSchedule,
  seedFromCrawl,
  seedFromValidatorSets,
  upcoming,
  type ScheduleEvent,
  type ScheduleState,
} from './schedule'

const id = (n: number) => n.toString(16).padStart(64, '0')
const stamp = (source: 'dapi' | 'radar'): SourceStamp => ({
  source,
  asOf: 0,
  fetchedAt: 0,
  proved: false,
})
/** One set of 40 evonodes, numbered 1..40, the last proposer `last`, read at block `height`. */
function sets(last: number): ValidatorSets {
  const quorumHash = id(9999)
  return {
    order: [quorumHash],
    current: quorumHash,
    sets: [
      {
        quorumHash,
        members: Array.from({ length: 40 }, (_, i) => ({ proTxHash: id(i + 1), banned: false })),
      },
    ],
    lastProposer: id(last),
  }
}
const dapiSeed = (height: number, last: number, timeMs = height * 1000) =>
  seedFromValidatorSets(sets(last), { height, timeMs }, stamp('dapi'))
const run = (...events: ScheduleEvent[]) => events.reduce(reduceSchedule, initialSchedule)
const shown = (s: ScheduleState) => upcoming(s).map((r) => [parseInt(r.protx, 16), r.away])
const tip = (height: number, timeMs = height * 1000): ScheduleEvent => ({
  type: 'tip',
  height,
  timeMs,
})
const seed = (s: ReturnType<typeof dapiSeed>): ScheduleEvent => ({ type: 'seed', seed: s })

describe('the live schedule', () => {
  it('counts the next twelve from the block the order was read at, before any proved block', () => {
    const s = run(seed(dapiSeed(100, 5)))
    expect(shown(s)).toEqual(Array.from({ length: 12 }, (_, i) => [6 + i, i + 1]))
    // An unproved answer never sets the latest block.
    expect(s.tip).toBeUndefined()
    expect(run(seed(dapiSeed(100, 5)), tip(100)).tip).toEqual({
      height: 100,
      timeMs: 100_000,
      proposer: id(5),
    })
  })

  it('drops the proposer whose block landed, moves the rest up and adds a twelfth', () => {
    const before = run(seed(dapiSeed(100, 5)), tip(100))
    const after = reduceSchedule(before, tip(101))
    expect(shown(after)[0]).toEqual([7, 1])
    expect(shown(after).at(-1)).toEqual([18, 12])
    expect(after.passed).toEqual([id(6)])
    expect(after.rev).toBe(before.rev + 1)
    expect(movedOn(after)).toBe(1)
    // Nobody named the proposer of block 101: it is not stated.
    expect(after.tip).toEqual({ height: 101, timeMs: 101_000 })
  })

  it('drops every turn a jump of several blocks passed', () => {
    const s = run(seed(dapiSeed(100, 5)), tip(100), tip(103))
    expect(s.passed).toEqual([id(6), id(7), id(8)])
    expect(shown(s)[0]).toEqual([9, 1])
  })

  it('ignores a repeated block and one that arrives late, from a node behind', () => {
    const s = run(seed(dapiSeed(100, 5)), tip(100), tip(102))
    expect(reduceSchedule(s, tip(102))).toBe(s)
    expect(reduceSchedule(s, tip(101))).toBe(s)
    // A reading from a node a block behind is still a newer order than the one in force, but not a newer block.
    const late = reduceSchedule(s, seed(dapiSeed(101, 6)))
    expect(late.seed?.height).toBe(101)
    expect(late.tip).toEqual(s.tip)
    expect(shown(late)[0]).toEqual([8, 1])
  })

  it('takes a newer reading of the validator sets, with the proposer of its block', () => {
    const s = run(seed(dapiSeed(100, 5)), tip(100), tip(101))
    // Evonode 6 missed its turn: 7 proposed block 101.
    const next = reduceSchedule(s, seed(dapiSeed(101, 7)))
    expect(next.tip).toEqual({ height: 101, timeMs: 101_000, proposer: id(7) })
    expect(shown(next)[0]).toEqual([8, 1])
    expect(movedOn(next)).toBe(0)
  })

  it('places the turns from a reading a block or two ahead, but leaves the list where the proved block is', () => {
    const s = run(seed(dapiSeed(100, 5)), tip(100))
    const next = reduceSchedule(s, seed(dapiSeed(102, 7)))
    expect(next.tip).toEqual(s.tip)
    expect(next.rev).toBe(s.rev)
    expect(shown(next)[0]).toEqual([8, 3])
    // Its proposer waits for a proof-checked read of block 102.
    const proved = reduceSchedule(next, tip(102))
    expect(proved.tip?.proposer).toBe(id(7))
    // 6 and 7 were never shown once the reading placed them before block 103: the rows just count down.
    expect(proved.passed).toEqual([])
    expect(shown(proved)[0]).toEqual([8, 1])
  })

  it('refuses a reading far ahead of the proved block and keeps following the chain', () => {
    const s = run(seed(dapiSeed(100, 5)), tip(100))
    expect(reduceSchedule(s, seed(dapiSeed(1_000_000_000, 5)))).toBe(s)
    expect(reduceSchedule(s, seed(dapiSeed(150, 5)))).toBe(s)
    const next = run(
      seed(dapiSeed(100, 5)),
      tip(100),
      seed(dapiSeed(1_000_000_000, 5)),
      tip(101),
      seed(dapiSeed(101, 6)),
    )
    expect(next.tip).toEqual({ height: 101, timeMs: 101_000, proposer: id(6) })
    expect(shown(next)[0]).toEqual([7, 1])
  })

  it('drops an order read far ahead once the first proved block arrives, and takes an honest one', () => {
    const crawl = seedFromCrawl(
      {
        height: 100,
        ts: 50,
        next: Array.from({ length: 30 }, (_, i) => ({ protx: id(i + 1), slots: i + 1 })),
      },
      stamp('radar'),
    )
    const s = run({ type: 'seed', seed: crawl }, seed(dapiSeed(1_000_000_000, 5)), tip(104))
    expect(s.dapi).toBeUndefined()
    expect(s.seed?.origin).toBe('radar')
    expect(shown(s)[0]).toEqual([5, 1])
    const honest = reduceSchedule(s, seed(dapiSeed(104, 9)))
    expect(honest.seed?.origin).toBe('dapi')
    expect(honest.tip?.proposer).toBe(id(9))
  })

  it('names the proposer of a block when the reading for that very block comes after it', () => {
    const s = run(seed(dapiSeed(100, 5)), tip(100), tip(101))
    expect(s.tip?.proposer).toBeUndefined()
    const named = reduceSchedule(s, seed(dapiSeed(101, 6)))
    expect(named.tip?.proposer).toBe(id(6))
    expect(named.rev).toBe(s.rev)
  })

  it('starts from the crawl, moves it on block by block, and gives way to DAPI', () => {
    const crawl = seedFromCrawl(
      {
        height: 100,
        ts: 50,
        next: Array.from({ length: 30 }, (_, i) => ({ protx: id(i + 1), slots: i + 1 })),
      },
      stamp('radar'),
    )
    const cold = run({ type: 'seed', seed: crawl })
    expect(cold.tip).toBeUndefined()
    expect(shown(cold)[0]).toEqual([1, 1])
    const moved = run({ type: 'seed', seed: crawl }, tip(104))
    expect(shown(moved)[0]).toEqual([5, 1])
    expect(movedOn(moved)).toBe(4)
    const live = reduceSchedule(moved, seed(dapiSeed(104, 9)))
    expect(live.seed?.origin).toBe('dapi')
    expect(shown(live)[0]).toEqual([10, 1])
    // An older crawl never replaces the live order.
    expect(reduceSchedule(live, { type: 'seed', seed: crawl })).toBe(live)
  })

  it('runs out, rather than guessing, once the blocks pass the end of the crawl’s list', () => {
    const crawl = seedFromCrawl(
      { height: 100, ts: 50, next: [{ protx: id(1), slots: 1 }] },
      stamp('radar'),
    )
    expect(upcoming(run({ type: 'seed', seed: crawl }, tip(130)))).toEqual([])
  })

  it('starts empty for each network: a switch remounts the section on a fresh state', () => {
    expect(upcoming(initialSchedule)).toEqual([])
    expect(initialSchedule.tip).toBeUndefined()
    expect(initialSchedule.seed).toBeUndefined()
  })
})

describe('timing', () => {
  it('measures the pace over the epoch so far, else the crawl’s, else a typical one', () => {
    const epoch = { firstBlockHeight: 1000, firstBlockTimeMs: 0 }
    expect(blockInterval({ epoch, tip: { height: 1100, timeMs: 12_000_000 }, mainnet: true })).toBe(
      120_000,
    )
    expect(
      blockInterval({
        epoch,
        tip: { height: 1010, timeMs: 1 },
        crawlBlockSecs: 7.5,
        mainnet: false,
      }),
    ).toBe(7_500)
    expect(blockInterval({ mainnet: true })).toBe(140_000)
    expect(blockInterval({ mainnet: false })).toBe(10_000)
  })

  it('puts the next turn one interval after the newest block, never in the past', () => {
    const row = { protx: id(1), height: 0, away: 1 }
    expect(etaOf(row, 1_000, 100, 0)).toBe(1_100)
    expect(etaOf({ ...row, away: 3 }, 1_000, 100, 0)).toBe(1_300)
    expect(etaOf({ ...row, away: 3 }, 1_000, 100, 5_000)).toBe(5_200)
  })
})
