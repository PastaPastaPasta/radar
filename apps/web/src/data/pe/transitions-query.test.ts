import { describe, expect, it } from 'vitest'
import { FILTER_TYPES, peBatchNumber, peTypeNumber, txOrder, txsQuery } from './transitions-query'

const base = { page: 1, limit: 25, sort: '-time' }

describe('transition numbers', () => {
  it('uses Explorer’s numbering, not the order of the badge list', () => {
    expect(peTypeNumber('data-contract-create')).toBe(0)
    expect(peTypeNumber('batch')).toBe(1)
    expect(peTypeNumber('data-contract-update')).toBe(4)
    expect(peTypeNumber('masternode-vote')).toBe(8)
    expect(peTypeNumber('shielded')).toBeUndefined()
    expect(peBatchNumber('document-create')).toBe(0)
    expect(peBatchNumber('token-mint')).toBe(7)
    expect(peBatchNumber('token-transfer')).toBe(8)
  })

  it('offers only types Explorer can filter by', () => {
    expect(FILTER_TYPES).not.toContain('shielded')
    expect(FILTER_TYPES).toContain('batch')
  })
})

describe('txOrder', () => {
  it('maps the address’s sort to Explorer’s order fields', () => {
    expect(txOrder('-time')).toEqual({ orderBy: 'timestamp', order: 'desc' })
    expect(txOrder('gas')).toEqual({ orderBy: 'gas_used', order: 'asc' })
    expect(txOrder('-owner')).toEqual({ orderBy: 'owner', order: 'desc' })
    expect(txOrder('whatever')).toEqual({ orderBy: 'timestamp', order: 'asc' })
  })
})

describe('txsQuery', () => {
  it('sorts newest first with no filters', () => {
    expect(txsQuery(base)).toEqual({ order: 'desc', orderBy: 'timestamp' })
  })

  it('repeats the type for each choice', () => {
    expect(txsQuery({ ...base, type: ['identity-create', 'identity-top-up'] })).toMatchObject({
      transaction_type: ['2', '3'],
    })
  })

  it('asks for batches only when a batch type is chosen', () => {
    expect(txsQuery({ ...base, batch: ['document-create', 'token-mint'] })).toMatchObject({
      transaction_type: ['1'],
      batch_type: ['0', '7'],
    })
  })

  it('names status, gas, owner and the dates in Explorer’s parameters', () => {
    expect(
      txsQuery({
        ...base,
        status: 'fail',
        gas: { min: 1, max: 5 },
        owner: 'abc',
        from: '2026-11-10',
        to: '2026-11-11',
      }),
    ).toMatchObject({
      status: 'FAIL',
      gas_min: 1,
      gas_max: 5,
      owner: 'abc',
      timestamp_start: '2026-11-10T00:00:00.000Z',
      timestamp_end: '2026-11-11T23:59:59.999Z',
    })
  })
})
