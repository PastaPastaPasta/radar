import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { fixture, listFixtures } from '@/test/fixtures/load'
import * as S from '@/data/radar/schemas'

const rules: [RegExp, z.ZodType][] = [
  [/^status$/, S.RadarStatusSchema],
  [/^health$/, S.RadarHealthSchema],
  [/^releases$/, S.RadarReleasesSchema],
  [/^summary$/, S.RadarSummarySchema],
  [/^geo$/, S.RadarGeoSchema],
  [/^masternodes$/, S.RadarMasternodesSchema],
  [/^masternodes__[0-9a-f]{64}$/, S.RadarMasternodeDetailSchema],
  [/^masternodes__[0-9a-f]{64}__payments/, S.RadarPaymentsSchema],
  [/^masternodes__[0-9a-f]{64}__bench$/, S.RadarMnBenchSchema],
  [/^bench$/, S.RadarBenchSchema],
  [/^platform$/, S.RadarPlatformSchema],
  [/^activation$/, S.RadarActivationSchema],
  [/^changes$/, S.RadarChangesSchema],
  [/^history--/, S.RadarHistorySchema],
]

const sets = [['global'], ['mainnet'], ['testnet']] as const

describe.each(sets)('radar fixtures (%s)', (net) => {
  const slugs = listFixtures('radar', net)

  it('has recordings', () => {
    expect(slugs.length).toBeGreaterThan(0)
  })

  it.each(slugs)('%s parses', async (slug) => {
    const rule = rules.find(([re]) => re.test(slug))
    expect(rule, `no schema rule for radar fixture ${slug}`).toBeDefined()
    const recorded = await fixture('radar', net, slug)
    if (recorded.status !== 200) return
    const result = rule![1].safeParse(recorded.body)
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true)
  })
})

describe('radar schema edge cases', () => {
  it('lower-cases protx and turns epoch seconds into ms', () => {
    const parsed = S.RadarPaymentSchema.parse({
      height: 5,
      time: 100,
      amount_duffs: 77060207,
      block_hash: 'AB'.repeat(32),
    })
    expect(parsed.block_hash).toBe('ab'.repeat(32))
    expect(parsed.time).toBe(100_000)
    expect(parsed.amount_duffs).toBe(77060207n)
  })

  it('rejects a payment without an amount', () => {
    expect(
      S.RadarPaymentSchema.safeParse({ height: 5, time: 1, block_hash: 'ab'.repeat(32) }).success,
    ).toBe(false)
  })
})
