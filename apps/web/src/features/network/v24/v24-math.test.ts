import { describe, expect, it } from 'vitest'
import { RadarActivationSchema, v24Pending, type ActivationWindow } from '@/data/radar/schemas'
import mainnet from '@/test/fixtures/http/radar/mainnet/activation.json'
import testnet from '@/test/fixtures/http/radar/testnet/activation.json'
import signalling from './signalling.fixture.json'
import {
  currentRate,
  estimateMs,
  layoutOf,
  poolStandings,
  milestones,
  projectLockIn,
  rateOf,
  thresholdRows,
  todaysPace,
  v24Of,
  windowOutlook,
  windowProgress,
  windowSlots,
} from './v24-math'

const mainnetDoc = RadarActivationSchema.parse(mainnet.body)
const testnetDoc = RadarActivationSchema.parse(testnet.body)

describe('milestones', () => {
  it('lists the road while waiting for the signal, with the passed start time done', () => {
    const d = v24Of(mainnetDoc)!
    const road = milestones(d, d.outlook)
    expect(road.map((m) => m.id)).toEqual([
      'start-time',
      'signal',
      'first-window',
      'lock-in',
      'activation',
    ])
    expect(road.map((m) => m.done)).toEqual([true, false, false, false, false])
  })

  it('lists the finished road once active', () => {
    const d = v24Of(testnetDoc)!
    const road = milestones(d, d.outlook)
    expect(road.map((m) => m.id)).toEqual(['signal', 'locked-in', 'active'])
    expect(road.every((m) => m.done)).toBe(true)
    expect(road[1]!.block!.height).toBe(1_578_000 - 100)
  })
})

describe('windowProgress', () => {
  it('counts signalling blocks and projects the pace to the window’s end', () => {
    const p = windowProgress(
      {
        count: 2,
        mined: 4,
        start: { height: 0 },
        end: { height: 9 },
        signalling: '#-#-',
      },
      10,
    )
    expect(p.cumulative).toEqual([0, 1, 1, 2, 2])
    expect(p.mined).toBe(4)
    expect(p.projected).toBe(5)
  })
})

describe('window slots and threshold rows', () => {
  it('dates windows to come from the earliest start, one pace apart, until the threshold bottoms out', () => {
    const d = v24Of(mainnetDoc)!
    const slots = windowSlots(d, mainnetDoc.block_seconds)
    expect(slots.length).toBeGreaterThan(5)
    expect(slots.every((s) => s.future)).toBe(true)
    expect(slots[0]!.height).toBe(2_572_416)
    expect(slots[1]!.height - slots[0]!.height).toBe(4032)
    expect(slots[0]!.threshold).toBe(3226)
  })

  it('marks no window as current and dates none before the signal on a decided deployment', () => {
    const d = v24Of(testnetDoc)!
    const rows = thresholdRows(d, testnetDoc.block_seconds)
    expect(rows.some((r) => r.now)).toBe(false)
    expect(rows.every((r) => !r.estimated)).toBe(true)
  })

  it('gives the schedule’s thresholds by attempt', () => {
    const d = v24Of(mainnetDoc)!
    const rows = thresholdRows(d, mainnetDoc.block_seconds)
    expect(rows).toHaveLength(d.schedule.length)
    expect(rows[0]).toMatchObject({
      attempt: 0,
      threshold: 3226,
      startHeight: 2_572_416,
      estimated: true,
    })
  })
})

describe('v24Pending', () => {
  const DAY = 86_400_000

  it('is true while the deployment is pending', () => {
    expect(v24Pending(mainnetDoc, Date.now())).toBe(true)
  })

  it('is true for under 30 days after activation and false after', () => {
    const activated = v24Of(testnetDoc)!.outlook.activation!.time! * 1000
    expect(v24Pending(testnetDoc, activated + 29 * DAY)).toBe(true)
    expect(v24Pending(testnetDoc, activated + 31 * DAY)).toBe(false)
  })

  it('is false without the document or a v24 deployment', () => {
    expect(v24Pending(undefined, 0)).toBe(false)
    expect(v24Pending({ ...mainnetDoc, deployments: [] }, 0)).toBe(false)
  })
})

describe('the lock-in outlook (mainnet at block 2,577,670)', () => {
  const doc = RadarActivationSchema.parse(signalling)
  const d = v24Of(doc)!

  it("goes by this window's share once it has a day of blocks", () => {
    const pace = todaysPace(d)!
    expect(pace).toEqual({ signalled: 688, blocks: 1223, basis: 'window' })
    expect(todaysPace({ ...d, window: { ...d.window!, mined: 100, count: 60 } })).toEqual({
      signalled: 329,
      blocks: 576,
      basis: 'recent',
    })
  })

  it('says this window needs 2,538 of the 2,809 blocks left, more than it gets at 56%', () => {
    const w = windowOutlook(d, rateOf(todaysPace(d)!))!
    expect(w).toMatchObject({
      verdict: 'needs-more',
      count: 688,
      mined: 1223,
      remaining: 2809,
      threshold: 3226,
      needed: 2538,
      projected: 2268,
      endHeight: 2_580_479,
    })
    expect(windowOutlook(d, 0.95)!.verdict).toBe('on-track')
    expect(windowOutlook({ ...d, window: { ...d.window!, count: 400 } }, 1)!.verdict).toBe(
      'impossible',
    )
    expect(windowOutlook({ ...d, window: { ...d.window!, count: 3226 } }, 0)!.verdict).toBe(
      'reached',
    )
  })

  it('finds no window that locks in at 56%, under the 60% floor', () => {
    expect(projectLockIn(doc, d, 688 / 1223)).toEqual({ never: 'floor' })
  })

  it('finds the first window whose threshold the rate clears', () => {
    // 0.7 × 4032 = 2822: short of 2,831 (attempt 7), enough for 2,710 (attempt 8).
    const p = projectLockIn(doc, d, 0.7)
    expect(p).toEqual({
      attempt: 8,
      threshold: 2710,
      start: 2_576_448 + 8 * 4032,
      end: 2_576_448 + 9 * 4032 - 1,
      lockIn: 2_576_448 + 9 * 4032,
      activation: 2_576_448 + 10 * 4032,
    })
    // 0.6 × 4032 rounds down to 2,419, one short of the floor.
    expect(projectLockIn(doc, d, 0.6)).toEqual({ never: 'floor' })
    expect(projectLockIn(doc, d, 0.61)).toMatchObject({ attempt: 10 })
    expect(projectLockIn(doc, d, 0.95)).toMatchObject({ attempt: 0 })
    expect(projectLockIn(doc, d, 0.8)).toMatchObject({ attempt: 1 })
  })

  it('stops at the timeout, the current window included', () => {
    const soon = (ms: number) => ({ ...d, params: { ...d.params, timeout: ms } })
    // The window being counted ends past the timeout: it fails, so none locks in.
    expect(projectLockIn(doc, soon(estimateMs(doc, 2_580_479)), 0.7)).toEqual({ never: 'timeout' })
    // At 70% the ninth window would; a timeout two windows on comes first.
    expect(projectLockIn(doc, soon(estimateMs(doc, 2_580_479 + 2 * 4032)), 0.7)).toEqual({
      never: 'timeout',
    })
  })

  it('ends on a schedule that never falls', () => {
    const flat = {
      ...d,
      schedule: [{ attempt: 0, threshold: 3226 }],
      params: { ...d.params, timeout: null },
    }
    expect(projectLockIn(doc, flat, 0.7)).toEqual({ never: 'floor' })
  })

  it('dates heights to come at the recent pace', () => {
    expect(estimateMs(doc, 2_577_670)).toBe(1_795_530_762_000)
    expect(estimateMs(doc, 2_577_680)).toBe(1_795_530_762_000 + 1_571_000)
  })
})

describe('poolStandings', () => {
  const win = (
    marks: string,
    pools: { pool: string | null; blocks: number; signalling: number }[],
  ) => ({
    count: marks.split('#').length - 1,
    mined: marks.length,
    start: { height: 1000 },
    end: { height: 1999 },
    signalling: marks,
    pools,
  })
  const kinds = (w: ActivationWindow) =>
    Object.fromEntries(poolStandings(w).map((s) => [s.row.pool ?? '-', s.trend]))

  it('reads a pool as now signalling once the streak since the last miss must hold some of its blocks', () => {
    const marks = '-#'.repeat(400) + '#'.repeat(200)
    const t = kinds(
      win(marks, [
        { pool: 'ViaBTC', blocks: 500, signalling: 100 },
        { pool: 'F2Pool', blocks: 500, signalling: 500 },
      ]),
    )
    expect(t.ViaBTC).toEqual({ kind: 'on', since: 1000 + 799, streak: 201 })
    expect(t.F2Pool).toEqual({ kind: 'all' })
  })

  it('reads the lone holdout as stopped when it signalled long before its first miss and misses to the end', () => {
    const marks = '#'.repeat(600) + '-#'.repeat(200)
    const t = kinds(
      win(marks, [
        { pool: 'AntPool', blocks: 500, signalling: 300 },
        { pool: 'F2Pool', blocks: 500, signalling: 500 },
      ]),
    )
    expect(t.AntPool).toEqual({ kind: 'off', from: 1600, streak: 400 })
  })

  it('calls a small pool partly when the streak is too short to have held its blocks', () => {
    const marks = '-#'.repeat(450) + '#'.repeat(100)
    const t = kinds(
      win(marks, [
        { pool: 'Zpool', blocks: 20, signalling: 5 },
        { pool: 'F2Pool', blocks: 980, signalling: 545 },
      ]),
    )
    expect(t.Zpool).toEqual({ kind: 'partly' })
    expect(t.F2Pool).toEqual({ kind: 'on', since: 1899, streak: 101 })
  })

  it('makes no call on order when two pools miss and none could have stopped', () => {
    const marks = '-#'.repeat(500)
    const t = kinds(
      win(marks, [
        { pool: 'A', blocks: 500, signalling: 250 },
        { pool: 'B', blocks: 500, signalling: 250 },
      ]),
    )
    expect(t.A).toEqual({ kind: 'partly' })
    expect(t.B).toEqual({ kind: 'partly' })
  })

  it('makes no call on order without the block string, and keeps all and none', () => {
    const w = { ...win('#'.repeat(10), []), signalling: null, mined: 10 }
    const t = kinds({
      ...w,
      pools: [
        { pool: 'A', blocks: 5, signalling: 2 },
        { pool: 'B', blocks: 3, signalling: 3 },
        { pool: null, blocks: 2, signalling: 0 },
      ],
    })
    expect(t).toEqual({ A: { kind: 'partly' }, B: { kind: 'all' }, '-': { kind: 'none' } })
  })

  it('counts the share signalling now: whole pools that signal now, the window ratio for the unknown', () => {
    const marks = '-#'.repeat(400) + '#'.repeat(200)
    const s = poolStandings(
      win(marks, [
        { pool: 'ViaBTC', blocks: 500, signalling: 300 },
        { pool: 'F2Pool', blocks: 280, signalling: 280 },
        { pool: 'X', blocks: 20, signalling: 0 },
        { pool: 'Y', blocks: 200, signalling: 20 },
      ]),
    )
    // 400 misses: ViaBTC 200, Y 180, X 20. ViaBTC and Y signal now, X doesn't: 500 + 280 + 200 of 1,000.
    expect(s.map((x) => x.trend.kind)).toEqual(['on', 'all', 'none', 'on'])
    expect(currentRate(s)).toBeCloseTo(0.98)
  })

  it('does not call a pool that steadily misses a few of its blocks a switch', () => {
    // A 20% pool signalling in 90% of its blocks: 21 misses, one every 45 blocks, the last 100 blocks ago.
    const marks = Array.from({ length: 1000 }, (_, i) =>
      i % 45 === 0 && i <= 900 ? '-' : '#',
    ).join('')
    const t = kinds(
      win(marks, [
        { pool: 'P', blocks: 200, signalling: 179 },
        { pool: 'F2Pool', blocks: 800, signalling: 800 },
      ]),
    )
    expect(t.P).toEqual({ kind: 'partly' })
  })

  it('lays each mixed pool across the divide, labels the biggest holdout, and spans only a lone mixed pool', () => {
    const marks = '-#'.repeat(400) + '#'.repeat(200)
    const one = layoutOf(
      poolStandings(
        win(marks, [
          { pool: 'ViaBTC', blocks: 500, signalling: 100 },
          { pool: 'F2Pool', blocks: 500, signalling: 500 },
        ]),
      ),
      'Untagged',
    )
    expect(one.segments.map((x) => [x.name, x.on, x.blocks, x.since])).toEqual([
      ['F2Pool', true, 500, undefined],
      ['ViaBTC', true, 100, undefined],
      ['ViaBTC', false, 400, 1799],
    ])
    expect(one.span).toEqual({ name: 'ViaBTC', blocks: 500, left: 500 })

    const two = layoutOf(
      poolStandings(
        win('-'.repeat(300) + '#'.repeat(700), [
          { pool: 'A', blocks: 400, signalling: 210 },
          { pool: 'B', blocks: 100, signalling: 90 },
          { pool: 'C', blocks: 100, signalling: 0 },
          { pool: null, blocks: 400, signalling: 400 },
        ]),
      ),
      'Untagged',
    )
    expect(two.segments.map((x) => `${x.name}${x.on ? '+' : '-'}${String(x.blocks)}`)).toEqual([
      'Untagged+400',
      'A+210',
      'B+90',
      'B-10',
      'A-190',
      'C-100',
    ])
    expect(new Set(two.segments.map((x) => x.key)).size).toBe(two.segments.length)
    expect(two.span).toBeUndefined()
    // A's 190 misses outweigh C's 100, but A signals now.
    expect(two.blocker?.name).toBe('C')

    const partly = layoutOf(
      poolStandings({
        ...win('#'.repeat(250), []),
        signalling: null,
        pools: [
          { pool: 'P', blocks: 100, signalling: 90 },
          { pool: 'ViaBTC', blocks: 150, signalling: 0 },
        ],
      }),
      'Untagged',
    )
    expect(partly.blocker?.name).toBe('ViaBTC')
  })

  it('calls no stop when the holdout signalled in more blocks than it mined before its first miss', () => {
    // AntPool's first miss is at 607 (about 300 of its blocks before it), yet it signalled in 450 of 500: it kept
    // signalling in most of its blocks after, so it didn't stop.
    const marks = '#'.repeat(600) + ('#'.repeat(7) + '-').repeat(50)
    const t = kinds(
      win(marks, [
        { pool: 'AntPool', blocks: 500, signalling: 450 },
        { pool: 'F2Pool', blocks: 500, signalling: 500 },
      ]),
    )
    expect(t.AntPool).not.toEqual(expect.objectContaining({ kind: 'off' }))
  })

  it("calls no switch when the pools' totals don't match the window", () => {
    const marks = '-#'.repeat(400) + '#'.repeat(200)
    const t = kinds(
      win(marks, [
        { pool: 'ViaBTC', blocks: 450, signalling: 100 },
        { pool: 'F2Pool', blocks: 500, signalling: 500 },
      ]),
    )
    expect(t.ViaBTC).toEqual({ kind: 'partly' })
  })
})
