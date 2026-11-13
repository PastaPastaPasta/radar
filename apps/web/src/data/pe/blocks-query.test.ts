import { describe, expect, it } from 'vitest'
import { blocksQuery, dayEnd, dayStart, needsUpperHeight, rangeText } from './blocks-query'

const base = { page: 1, limit: 25, sort: '-height' }

describe('blocksQuery', () => {
  it('asks newest first with no filters', () => {
    expect(blocksQuery(base, undefined)).toEqual({ order: 'desc' })
  })

  it('asks oldest first for the ascending sort', () => {
    expect(blocksQuery({ ...base, sort: 'height' }, undefined)).toEqual({ order: 'asc' })
  })

  it('names each range in Explorer’s own parameters', () => {
    expect(
      blocksQuery(
        {
          ...base,
          height: { min: 100, max: 200 },
          epoch: { min: 3, max: undefined },
          gas: { min: undefined, max: 9 },
          txs: { min: 1, max: 4 },
        },
        undefined,
      ),
    ).toEqual({
      order: 'desc',
      height_min: 100,
      height_max: 200,
      epoch_index_min: 3,
      gas_max: 9,
      tx_count_min: 1,
      tx_count_max: 4,
    })
  })

  it('upper-cases the proposer and ignores one that is not a ProTxHash', () => {
    const hash = 'ab'.repeat(32)
    expect(blocksQuery({ ...base, proposer: hash }, undefined).validator).toBe(hash.toUpperCase())
    expect(blocksQuery({ ...base, proposer: 'nope' }, undefined).validator).toBeUndefined()
  })

  it('sends a lone date as a time bound', () => {
    expect(blocksQuery({ ...base, from: '2026-11-10' }, undefined)).toMatchObject({
      timestamp_start: dayStart('2026-11-10'),
    })
    expect(blocksQuery({ ...base, to: '2026-11-11' }, undefined)).toMatchObject({
      timestamp_end: dayEnd('2026-11-11'),
    })
  })

  it('turns the end of a date range into a height, because Explorer refuses both bounds in time', () => {
    const range = { ...base, from: '2026-11-10', to: '2026-11-11' }
    expect(needsUpperHeight(range)).toBe(true)
    expect(needsUpperHeight({ ...base, from: '2026-11-10' })).toBe(false)
    const q = blocksQuery(range, 469766)
    expect(q.timestamp_start).toBe(dayStart('2026-11-10'))
    expect(q.timestamp_end).toBeUndefined()
    expect(q.height_max).toBe(469766)
  })

  it('keeps the tighter of a height limit and the height a date resolved to', () => {
    const range = { ...base, from: '2026-11-10', to: '2026-11-11', height: { min: 1, max: 300 } }
    expect(blocksQuery(range, 500).height_max).toBe(300)
    expect(blocksQuery(range, 200).height_max).toBe(200)
  })
})

describe('rangeText', () => {
  it('writes min..max with either side empty, and nothing for no range', () => {
    expect(rangeText({ min: 1, max: 2 })).toBe('1..2')
    expect(rangeText({ min: undefined, max: 2 })).toBe('..2')
    expect(rangeText({ min: 1, max: undefined })).toBe('1..')
    expect(rangeText(undefined)).toBeUndefined()
    expect(rangeText({ min: undefined, max: undefined })).toBeUndefined()
  })
})
