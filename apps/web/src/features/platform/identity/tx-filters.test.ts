import { describe, expect, it } from 'vitest'
import { hasTxFilter, identityTxsPlan } from './tx-filters'

const ID = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const DASHPAY = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'

describe('identityTxsPlan', () => {
  it('reads the identity’s own list, ten at a time, with no filter', () => {
    expect(identityTxsPlan(ID, {})).toEqual({ filtered: false, limit: 10 })
    expect(hasTxFilter({ txtype: [], batch: [] })).toBe(false)
  })

  it('sends type, status, gas and date to Platform Explorer with the identity as owner', () => {
    const plan = identityTxsPlan(ID, {
      txtype: ['identity-top-up'],
      status: 'fail',
      gas: { min: 10 },
      from: '2026-11-01',
      to: '2026-11-02',
    })
    expect(plan).toEqual({
      filtered: true,
      limit: 10,
      query: expect.objectContaining({
        owner: ID,
        transaction_type: ['3'],
        status: 'FAIL',
        gas_min: 10,
        order: 'desc',
        orderBy: 'timestamp',
      }) as unknown,
    })
  })

  it('reads full pages of the types that can name a contract for a contract filter', () => {
    const plan = identityTxsPlan(ID, { contract: DASHPAY })
    expect(plan.limit).toBe(100)
    expect(plan.filtered && plan.query.transaction_type).toEqual([
      '0',
      '4',
      '1',
      '8',
      '24',
      '25',
      '26',
      '27',
      '28',
    ])
  })

  it('leaves a chosen type or batch type alone beside a contract filter', () => {
    const plan = identityTxsPlan(ID, { contract: DASHPAY, batch: ['document-create'] })
    expect(plan.filtered && plan.query).toMatchObject({
      transaction_type: ['1'],
      batch_type: ['0'],
    })
  })
})
