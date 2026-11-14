import { describe, expect, it } from 'vitest'
import type { QuorumDto } from '@/data/sdk/methods'
import { parseCreditId } from '../credits/CreditsPage'
import { parseNullifier } from '../shielded/ShieldedPage'
import { poolSeries } from '../shielded/pool-series'
import { filterQuorums } from './QuorumsPage'

const q = (quorumHash: string, quorumType: string): QuorumDto => ({
  quorumHash,
  quorumType,
  memberCount: 100,
  threshold: 67,
  isVerified: true,
})

const quorums = [
  q('0000001eaa', 'LLMQ_100_67'),
  q('0000002bbb', 'LLMQ_100_67'),
  q('0a0000ccdd', 'LLMQ_400_60'),
]

describe('filterQuorums', () => {
  it('matches a hash prefix in any case, with or without 0x', () => {
    expect(filterQuorums(quorums, '000000', undefined).map((x) => x.quorumHash)).toEqual([
      '0000001eaa',
      '0000002bbb',
    ])
    expect(filterQuorums(quorums, '0X0A00', undefined)).toHaveLength(1)
    expect(filterQuorums(quorums, '0000001EAA', undefined)).toHaveLength(1)
  })

  it('narrows by type, and an empty type filter keeps every type', () => {
    expect(filterQuorums(quorums, undefined, ['LLMQ_400_60'])).toHaveLength(1)
    expect(filterQuorums(quorums, undefined, ['LLMQ_400_60', 'LLMQ_100_67'])).toHaveLength(3)
    expect(filterQuorums(quorums, undefined, [])).toHaveLength(3)
  })

  it('combines both and finds nothing for a prefix that is not there', () => {
    expect(filterQuorums(quorums, '000000', ['LLMQ_400_60'])).toEqual([])
    expect(filterQuorums(quorums, 'ff', undefined)).toEqual([])
  })
})

describe('parseCreditId', () => {
  const id = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
  it('keeps a base58 id and turns 64 hex characters into one', () => {
    expect(parseCreditId(` ${id} `)).toBe(id)
    expect(parseCreditId('11111111111111111111111111111111')).toBe(
      '11111111111111111111111111111111',
    )
    expect(parseCreditId('00'.repeat(32))).toBe('11111111111111111111111111111111')
    expect(parseCreditId('0x' + 'ab'.repeat(32))).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/)
  })

  it('refuses anything else', () => {
    expect(parseCreditId('')).toBeUndefined()
    expect(parseCreditId('not an id')).toBeUndefined()
    expect(parseCreditId('ab'.repeat(31))).toBeUndefined()
    expect(parseCreditId(id.slice(0, 20))).toBeUndefined()
  })
})

describe('parseNullifier', () => {
  it('lower-cases 64 hex characters and drops 0x', () => {
    expect(parseNullifier('AB'.repeat(32))).toBe('ab'.repeat(32))
    expect(parseNullifier('0x' + 'cd'.repeat(32))).toBe('cd'.repeat(32))
  })

  it('refuses a short, long or non-hex value', () => {
    expect(parseNullifier('ab'.repeat(31))).toBeUndefined()
    expect(parseNullifier('ab'.repeat(33))).toBeUndefined()
    expect(parseNullifier('zz'.repeat(32))).toBeUndefined()
  })
})

describe('poolSeries', () => {
  it('puts both sides on one axis and fills a missing bucket with zero, in DASH', () => {
    const out = poolSeries(
      [
        { t: 2, amount: 200_000_000_000n },
        { t: 1, amount: 100_000_000_000n },
      ],
      [
        { t: 2, amount: 50_000_000_000n },
        { t: 3, amount: 10_000_000_000n },
      ],
    )
    expect(out.times).toEqual([1, 2, 3])
    expect(out.shielded).toEqual([1, 2, 0])
    expect(out.unshielded).toEqual([0, 0.5, 0.1])
  })
})
