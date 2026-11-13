import { describe, expect, it } from 'vitest'
import { base58Encode } from '@/lib/base58'
import { hexToBytes } from '@/lib/hex'
import {
  buildEvoRows,
  evoFilterCounts,
  filterEvoRows,
  protxOfIdentity,
  sortEvoRows,
  type EvoRow,
} from '@/data/masternodes/platform'
import type { MnRow } from '@/data/masternodes/rows'
import type { PeValidator } from '@/data/pe/schemas'
import type { RadarPlatform } from '@/data/radar/schemas'

const hex = (n: number) => n.toString(16).padStart(64, '0')

const mn = (n: number, over: Partial<MnRow> = {}): MnRow => ({
  protx: hex(n),
  type: 'evo',
  status: 'enabled',
  service: `10.0.0.${n}:9999`,
  host: `10.0.0.${n}`,
  registration: null,
  crawl: null,
  dapi: null,
  radar: null,
  ...over,
})

const radar = (n: number, over: Record<string, unknown> = {}) => ({
  protx: hex(n),
  service: `10.0.0.${n}:9999`,
  status: 'enabled',
  drive: '5.0.3',
  monthly: BigInt(n) * 100n,
  epoch_blocks: n,
  next: null,
  supports: null,
  vote: null,
  ...over,
})

const platform = (evonodes: unknown[]) => ({ evonodes }) as unknown as RadarPlatform
const validator = (n: number) => ({ proTxHash: hex(n), isActive: true }) as unknown as PeValidator

describe('buildEvoRows', () => {
  const rows = [mn(1), mn(2), mn(3, { status: 'pose-banned' }), mn(4, { type: 'regular' })]

  it('keeps only the evonodes', () => {
    expect(buildEvoRows(rows, {}).map((e) => e.protx)).toEqual([hex(1), hex(2), hex(3)])
  })

  it('joins Radar’s record by ProTx and takes its block count', () => {
    const [first, second] = buildEvoRows(rows, { platform: platform([radar(1)]) })
    expect(first).toMatchObject({ blocks: 1, radar: { drive: '5.0.3' } })
    expect(second).toMatchObject({ blocks: null, radar: null })
  })

  it('lets the SDK’s count win, and counts an evonode it names no block for as none', () => {
    const out = buildEvoRows(rows, {
      platform: platform([radar(1), radar(2)]),
      proposed: { asked: new Set([hex(1), hex(2)]), counts: new Map([[hex(1), 9n]]) },
    })
    expect(out[0]?.blocks).toBe(9)
    expect(out[1]?.blocks).toBe(0)
  })

  it('reads the validator set as active, queued or banned, and as unknown without it', () => {
    expect(buildEvoRows(rows, {}).map((e) => e.state)).toEqual([null, null, 'banned'])
    const states = buildEvoRows(rows, { validators: [validator(1)] }).map((e) => e.state)
    expect(states).toEqual(['active', 'queued', 'banned'])
  })
})

describe('protxOfIdentity', () => {
  const protx = 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff'
  const identity = base58Encode(hexToBytes(protx))

  it('reads a base58 identity id as the ProTx it is made from', () => {
    expect(protxOfIdentity(identity)).toBe(protx)
  })

  it('refuses text that is not one', () => {
    expect(protxOfIdentity('hello')).toBeUndefined()
    expect(protxOfIdentity(protx)).toBeUndefined()
    expect(protxOfIdentity(`${identity}0`)).toBeUndefined()
  })
})

describe('filterEvoRows', () => {
  const REAL = 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff'
  const evo = buildEvoRows([mn(1), mn(2), mn(3), mn(4), { ...mn(5), protx: REAL }], {
    platform: platform([
      radar(1, { next: 10, epoch_blocks: 0 }),
      radar(2, { next: null, epoch_blocks: 3, drive: '4.9.0' }),
      radar(3, { next: 5, epoch_blocks: 2, supports: 24, vote: 23 }),
      radar(4, { next: null, epoch_blocks: 0, supports: 24, vote: 24 }),
    ]),
  })
  const ids = (out: EvoRow[]) => out.map((e) => Number(`0x${e.protx}`))

  it('keeps those that proposed this epoch', () => {
    expect(ids(filterEvoRows(evo, { pf: 'proposed' }))).toEqual([2, 3])
  })

  it('keeps the enabled ones Radar sees no turn coming for', () => {
    expect(ids(filterEvoRows(evo, { pf: 'not-in-set' }))).toEqual([2, 4])
  })

  it('keeps those that support an upgrade and have not voted for it, only while a vote is open', () => {
    expect(ids(filterEvoRows(evo, { pf: 'vote-not-counted' }))).toEqual([])
    expect(ids(filterEvoRows(evo, { pf: 'vote-not-counted', candidate: 24 }))).toEqual([3])
  })

  it('searches ProTx, IP, Drive version and identity', () => {
    expect(ids(filterEvoRows(evo, { pf: 'all', q: '10.0.0.2' }))).toEqual([2])
    expect(ids(filterEvoRows(evo, { pf: 'all', q: '4.9' }))).toEqual([2])
    expect(ids(filterEvoRows(evo, { pf: 'all', q: hex(3).slice(-4) }))).toEqual([3])
    const identity = base58Encode(hexToBytes(REAL))
    expect(filterEvoRows(evo, { pf: 'all', q: identity }).map((e) => e.protx)).toEqual([REAL])
  })

  it('counts what each option would show', () => {
    expect(evoFilterCounts(evo, 24)).toEqual({
      all: 5,
      proposed: 2,
      'not-in-set': 2,
      'vote-not-counted': 1,
    })
  })
})

describe('sortEvoRows', () => {
  const evo = buildEvoRows([mn(1), mn(2), mn(3)], {
    platform: platform([radar(1), radar(3)]),
  })
  const ids = (out: EvoRow[]) => out.map((e) => Number(`0x${e.protx}`))

  it('sorts by earnings first, highest first, and leaves the unrecorded last', () => {
    expect(ids(sortEvoRows(evo, '-monthly'))).toEqual([3, 1, 2])
    expect(ids(sortEvoRows(evo, 'monthly'))).toEqual([1, 3, 2])
  })

  it('falls back to the earnings order for a key the evonode table does not have', () => {
    expect(ids(sortEvoRows(evo, '-status'))).toEqual([3, 1, 2])
  })
})
