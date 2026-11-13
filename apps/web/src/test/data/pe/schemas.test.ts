import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { fixture, listFixtures } from '@/test/fixtures/load'
import * as S from '@/data/pe/schemas'

const rules: [RegExp, z.ZodType][] = [
  [/^status$/, S.PeStatusSchema],
  [/^rate$/, S.PeRateSchema],
  [/^epoch(__\d+)?$/, S.PeEpochDetailSchema],
  [/^blocks--/, S.peList(S.PeBlockSummarySchema)],
  [/^block__/, S.PeBlockSchema],
  [/^transactions--/, S.peList(S.PeTransactionSchema)],
  [/^transaction__/, S.PeTransactionSchema],
  [/^identities--/, S.peList(S.PeIdentitySchema)],
  [/^identity__[^_]+$/, S.PeIdentitySchema],
  [/^identity__.*__transactions/, S.peList(S.PeTransactionSchema)],
  [/^identity__.*__dataContracts/, S.peList(S.PeDataContractSchema)],
  [/^identity__.*__documents/, S.peList(S.PeDocumentSchema)],
  [/^identity__.*__transfers/, S.peList(S.PeTransferSchema)],
  [/^identity__.*__tokens/, S.peList(S.PeTokenSchema)],
  [/^identity__.*__withdrawals/, S.peList(z.unknown())],
  [/^validators--/, S.peList(S.PeValidatorSchema)],
  [/^validator__[^_]+$/, S.PeValidatorSchema],
  [/^validator__.*earnings/, S.PeValidatorEarningsSchema],
  [/^validator__.*rewards__stats/, S.peSeries(S.PeRewardPointSchema)],
  [/^validator__.*__stats/, S.peSeries(S.PeBlocksCountPointSchema)],
  [/^quorums$/, z.array(S.PeQuorumSchema)],
  [/^quorums__current$/, S.PeQuorumSchema],
  [/^dataContracts--/, S.peList(S.PeDataContractSchema)],
  [/^dataContract__[^_]+$/, S.PeDataContractSchema],
  [/^dataContract__.*__documents/, S.peList(S.PeDocumentSchema)],
  [/^dataContract__.*__transactions/, S.peList(S.PeContractTransactionSchema)],
  [/^dataContracts__(rating|active)/, S.peList(S.PeContractActivitySchema)],
  [/^document__[^_]+--/, S.PeDocumentSchema],
  [/^document__.*__revisions/, S.peList(S.PeDocumentSchema)],
  [/^tokens--/, S.peList(S.PeTokenSchema)],
  [/^tokens__rating/, S.peList(S.PeTokenRatingSchema)],
  [/^token__[^_]+$/, S.PeTokenSchema],
  [/^token__.*holders/, S.peList(S.PeTokenHolderSchema)],
  [/^token__.*transitions/, S.peList(S.PeTokenTransitionSchema)],
  [/^contestedResources--/, S.peList(S.PeContestedResourceSchema)],
  [/^contestedResources__stats$/, S.PeContestedResourcesStatsSchema],
  [/^contestedResource__[^_]+$/, S.PeContestedResourceSchema],
  [/^contestedResource__.*votes/, S.peList(S.PeVoteSchema)],
  [/^masternodes__votes/, S.peList(S.PeVoteSchema)],
  [/^identities__active/, S.peList(S.PeActiveIdentitySchema)],
  [/^identities__history/, S.peSeries(S.PeIdentityHistoryPointSchema)],
  [/^transactions__history/, S.peSeries(S.PeTxHistoryPointSchema)],
  [/^transactions__statistic$/, S.PeTxStatisticSchema],
  [/^transactions__shielded__statistic/, S.PeShieldedStatisticSchema],
  [/^transactions__shielded__pool$/, S.PeShieldedPoolSchema],
  [/^transactions__(un)?shield__history/, S.peSeries(S.PeShieldHistoryPointSchema)],
  [/^platformAddresses--/, S.peList(S.PePlatformAddressSchema)],
  [/^platformAddress__.*__info$/, S.PePlatformAddressSchema],
  [/^platformAddress__.*__transitions/, S.peList(S.PeTransactionSchema)],
  [/^search--/, S.PeSearchSchema],
]

describe.each(['mainnet', 'testnet'])('pe fixtures (%s)', (net) => {
  const slugs = listFixtures('pe', net)

  it('has recordings', () => {
    expect(slugs.length).toBeGreaterThan(20)
  })

  it.each(slugs)('%s parses', async (slug) => {
    const rule = rules.find(([re]) => re.test(slug))
    expect(rule, `no schema rule for pe fixture ${slug}`).toBeDefined()
    const recorded = await fixture('pe', net, slug)
    if (recorded.status !== 200) return
    const result = rule![1].safeParse(recorded.body)
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 3))).toBe(true)
  })
})

describe('pe schema behaviour', () => {
  const page = S.peList(z.object({ id: z.number() }))

  it('turns PE paging into Page<T> and reads total -1 as unknown', () => {
    expect(
      page.parse({ resultSet: [{ id: 1 }], pagination: { page: 2, limit: 10, total: 31 } }),
    ).toEqual({ items: [{ id: 1 }], page: 2, total: 31 })
    expect(
      page.parse({ resultSet: [], pagination: { page: null, limit: null, total: -1 } }),
    ).toEqual({ items: [], page: undefined, total: undefined })
  })

  it('lower-cases hashes, converts amounts to bigint and times to ms', () => {
    const tx = S.PeTransactionSchema.parse({
      hash: 'AB'.repeat(32),
      type: 'IDENTITY_TOP_UP',
      timestamp: '2026-11-10T14:50:22.103Z',
      status: 'SUCCESS',
      amount: '8000000000',
      batchType: 0,
      owner: 'BMJWm8wKmbApR7nQ6q7RG3HgD8maJ8t7B4yWBKRe7aZ6',
    })
    expect(tx.hash).toBe('ab'.repeat(32))
    expect(tx.amount).toBe(8_000_000_000n)
    expect(tx.timestamp).toBe(Date.parse('2026-11-10T14:50:22.103Z'))
    expect(tx.owner).toEqual({
      identifier: 'BMJWm8wKmbApR7nQ6q7RG3HgD8maJ8t7B4yWBKRe7aZ6',
      aliases: [],
    })
  })

  it('flattens series rows into timestamped points', () => {
    const rows = S.peSeries(S.PeBlocksCountPointSchema).parse([
      { timestamp: '2026-11-10T14:01:49.420Z', data: { blocksCount: 4 } },
    ])
    expect(rows).toEqual([{ t: Date.parse('2026-11-10T14:01:49.420Z'), blocksCount: 4 }])
  })

  it('rejects a transaction without a hash', () => {
    expect(
      S.PeTransactionSchema.safeParse({
        type: 'BATCH',
        timestamp: '2026-11-10T00:00:00Z',
        status: 'SUCCESS',
      }).success,
    ).toBe(false)
  })
})
