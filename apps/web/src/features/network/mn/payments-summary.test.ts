import { describe, expect, it } from 'vitest'
import { paymentsSummary } from './PaymentsTab'

const summary = (count: number, total: bigint) => ({
  count,
  total_duffs: total,
  first_height: 2_573_885,
  indexed: { from: 1_047_200, to: 2_574_939 },
})

describe('paymentsSummary', () => {
  it('adds up to the duff, not to the whole DASH', () => {
    expect(paymentsSummary(summary(1, 77_070_255n), { unit: 'DASH', testnet: false })).toBe(
      '1 payment, 0.7707 DASH in total; indexed blocks 1,047,200 to 2,574,939',
    )
  })

  it('counts several payments in the plural and keeps the fraction', () => {
    expect(paymentsSummary(summary(80, 6_502_459_400n), { unit: 'DASH', testnet: false })).toBe(
      '80 payments, 65.0246 DASH in total; indexed blocks 1,047,200 to 2,574,939',
    )
  })

  it('says tDASH on testnet', () => {
    expect(paymentsSummary(summary(2, 150_000_000n), { unit: 'DASH', testnet: true })).toContain(
      '1.5000 tDASH in total',
    )
  })
})
