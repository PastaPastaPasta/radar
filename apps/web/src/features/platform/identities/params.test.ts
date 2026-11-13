import { describe, expect, it } from 'vitest'
import type { PeIdentity } from '@/data/pe/schemas'
import { dashToCredits, inDateRange, parseIdentitySort, peIdentitiesQuery, rangeText } from './params'

const base = { page: 1, limit: 25, sort: '-created' }

describe('peIdentitiesQuery', () => {
  it('sends only the order for the default sort', () => {
    expect(peIdentitiesQuery(base)).toEqual({ limit: 25, order: 'desc' })
  })

  it('maps balance and transaction sorts to PE’s order_by', () => {
    expect(peIdentitiesQuery({ ...base, sort: '-balance' })).toEqual({ limit: 25, order: 'desc', order_by: 'balance' })
    expect(peIdentitiesQuery({ ...base, sort: 'txs' })).toEqual({ limit: 25, order: 'asc', order_by: 'tx_count' })
  })

  it('turns filters into PE’s min and max, with the balance in credits', () => {
    expect(
      peIdentitiesQuery({
        ...base,
        page: 3,
        type: ['masternode'],
        bal: { min: 1.5, max: 20 },
        txs: { min: 2 },
        docs: { max: 9 },
        contracts: { min: 1, max: 1 },
      }),
    ).toEqual({
      limit: 25,
      order: 'desc',
      page: 3,
      identity_type: 'masternode',
      balance_min: '150000000000',
      balance_max: '2000000000000',
      tx_count_min: 2,
      documents_count_max: 9,
      data_contracts_min: 1,
      data_contracts_max: 1,
    })
  })

  it('ignores a type PE does not know', () => {
    expect(peIdentitiesQuery({ ...base, type: ['nonsense'] })).not.toHaveProperty('identity_type')
  })
})

describe('helpers', () => {
  it('converts DASH to credits exactly', () => {
    expect(dashToCredits(0.00000001)).toBe('1000')
    expect(dashToCredits(10.13)).toBe('1013000000000')
  })

  it('reads sorts, falling back to newest first', () => {
    expect(parseIdentitySort('balance')).toEqual({ id: 'balance', desc: false })
    expect(parseIdentitySort('-txs')).toEqual({ id: 'txs', desc: true })
    expect(parseIdentitySort('whatever')).toEqual({ id: 'created', desc: true })
  })

  it('writes a range back in the form the filter takes', () => {
    expect(rangeText({ min: 1, max: 5 })).toBe('1..5')
    expect(rangeText({ max: 5 })).toBe('..5')
    expect(rangeText(undefined)).toBeUndefined()
  })

  it('keeps rows whose creation day is inside the dates, both days included', () => {
    const row = (iso: string) => ({ timestamp: Date.parse(iso) }) as PeIdentity
    expect(inDateRange(row('2026-11-05T23:00:00Z'), '2026-11-05', '2026-11-05')).toBe(true)
    expect(inDateRange(row('2026-11-06T00:00:00Z'), '2026-11-05', '2026-11-05')).toBe(false)
    expect(inDateRange(row('2026-11-04T23:59:59Z'), '2026-11-05', undefined)).toBe(false)
    expect(inDateRange({ timestamp: null } as PeIdentity, undefined, undefined)).toBe(true)
  })
})
