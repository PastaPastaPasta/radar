import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { fixture, listFixtures, streamLines } from '@/test/fixtures/load'
import * as S from '@/data/hyphen/schemas'

const rules: [RegExp, z.ZodType][] = [
  [/^status$/, S.HyStatusSchema],
  [/^blocks--/, S.hyPage(S.HyBlockSummarySchema)],
  [/^block__[^_]+$/, S.HyBlockDetailSchema],
  [/^block__.*__txs/, S.hyPage(S.HyBlockTxSchema)],
  [/^rawblock__/, S.HyRawBlockSchema],
  [/^tx__/, S.HyTxDetailSchema],
  [/^rawtx__/, S.HyRawTxSchema],
  [/^address__[^_]+$/, S.HyAddressSchema],
  [/^address__.*__txs/, S.hyPage(S.HyAddressTxSchema)],
  [/^address__.*__utxos/, S.hyPage(S.HyUtxoSchema)],
  [/^balances--/, S.HyBalancesSchema],
  [/^metrics__latest$/, S.HyMetricsSchema],
  [/^metrics__chart/, S.HyMetricsChartSchema],
  [/^mempool$/, S.HyMempoolSchema],
  [/^mempool__txs/, S.hyPage(S.HyMempoolTxSchema)],
  [/^network$/, S.HyNetworkSchema],
  [/^proposals--/, S.hyPage(S.HyProposalSchema)],
  [/^proposal__[^_]+$/, S.HyProposalSchema],
  [/^proposal__.*__votes/, S.hyPage(S.HyProposalVoteSchema)],
  [/^validators--/, S.hyPage(S.HyValidatorSchema)],
  [/^validator__/, S.HyValidatorDetailSchema],
  [/^search--/, S.HySearchSchema],
]

describe.each(['mainnet', 'testnet'])('hyphen fixtures (%s)', (net) => {
  const slugs = listFixtures('hyphen', net)

  it('has recordings', () => {
    expect(slugs.length).toBeGreaterThan(15)
  })

  it.each(slugs)('%s parses', async (slug) => {
    const rule = rules.find(([re]) => re.test(slug))
    expect(rule, `no schema rule for hyphen fixture ${slug}`).toBeDefined()
    const recorded = await fixture('hyphen', net, slug)
    if (recorded.status !== 200) return
    const result = rule![1].safeParse(recorded.body)
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true)
  })

  it('stream transcript parses', async () => {
    const lines = await streamLines('hyphen', net)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const result = S.HyStreamEventSchema.safeParse(JSON.parse(line))
      expect(result.success, line.slice(0, 120)).toBe(true)
    }
  })
})

describe('hyphen schema behaviour', () => {
  it('turns a cursor page into Page<T> with the snapshot height', () => {
    const page = S.hyPage(S.HyMempoolTxSchema).parse({
      totalCount: 15,
      value: [],
      nextCursor: 'abcd',
    })
    expect(page).toMatchObject({ items: [], total: 15, nextCursor: 'abcd' })
  })

  it('reads amounts as bigint', () => {
    const row = S.HyRichRowSchema.parse({
      rank: 1,
      address: 'Xabc',
      balance: 99290823006000,
      pctSupply: 0.077,
      totalReceived: 680291385061690,
      totalSent: 581000562055690,
      txCount: 189,
    })
    expect(row.balance).toBe(99290823006000n)
  })

  it('rejects a stream event with an unknown shape for a known type', () => {
    expect(
      S.HyStreamEventSchema.safeParse({ type: 'chain_lock', ts: 1, payload: {} }).success,
    ).toBe(false)
  })
})
