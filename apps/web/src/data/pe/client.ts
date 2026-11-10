import { z } from 'zod'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { formatBlock } from '../health-lag'
import { SourceError } from '../errors'
import { describeFailure, fetchSourced, requireEndpoint } from '../http'
import { healthRegistry } from '../health'
import type { Page } from '../page'
import {
  PeActiveIdentitySchema,
  PeAvgBlockTimePointSchema,
  PeBlockSchema,
  PeBlockSummarySchema,
  PeBlocksCountPointSchema,
  PeContestedResourceSchema,
  PeContestedResourcesStatsSchema,
  PeContractActivitySchema,
  PeContractTransactionSchema,
  PeDataContractSchema,
  PeDocumentSchema,
  PeEpochDetailSchema,
  PeGasHistoryPointSchema,
  PeIdentityHistoryPointSchema,
  PeIdentitySchema,
  PePlatformAddressSchema,
  PeQuorumSchema,
  PeRewardPointSchema,
  PeSearchSchema,
  PeShieldHistoryPointSchema,
  PeShieldedPoolSchema,
  PeShieldedStatisticSchema,
  PeStatusOrErrorSchema,
  PeTokenHolderSchema,
  PeTokenRatingSchema,
  PeTokenSchema,
  PeTokenTransitionSchema,
  PeTransactionSchema,
  PeTransferSchema,
  PeTxHistoryPointSchema,
  PeTxStatisticSchema,
  PeValidatorEarningsSchema,
  PeValidatorSchema,
  PeVerifySchema,
  PeVoteSchema,
  peList,
  peSeries,
  type PeActiveIdentity,
  type PeBlock,
  type PeBlockSummary,
  type PeContestedResource,
  type PeContestedResourcesStats,
  type PeContractActivity,
  type PeContractTransaction,
  type PeDataContract,
  type PeDocument,
  type PeEpochDetail,
  type PeIdentity,
  type PePlatformAddress,
  type PeQuorum,
  type PeSearch,
  type PeShieldedPool,
  type PeShieldedStatistic,
  type PeStatus,
  type PeToken,
  type PeTokenHolder,
  type PeTokenRating,
  type PeTokenTransition,
  type PeTransaction,
  type PeTransfer,
  type PeTxStatistic,
  type PeValidator,
  type PeValidatorEarnings,
  type PeVerify,
  type PeVote,
} from './schemas'
import { contestedResourceKey, type PeQuery, type PeTimeframe } from './params'

function search(params: PeQuery | undefined): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    if (typeof v === 'object') for (const item of v) sp.append(k, item)
    else sp.set(k, String(v))
  }
  return sp.size ? `?${sp}` : ''
}

const seg = encodeURIComponent

const PE_STALE_BLOCKS = 10

function base(net: NetworkId): string {
  return requireEndpoint(net, 'pe', 'pe')
}

function get<S extends z.ZodType>(
  net: NetworkId,
  path: string,
  schema: S,
  signal: AbortSignal | undefined,
  opts: {
    height?: (b: z.output<S>) => number | undefined
    asOf?: (b: z.output<S>, res: Response) => number
  } = {},
) {
  return fetchSourced({
    source: 'pe',
    net,
    url: () => `${base(net)}${path}`,
    schema,
    signal,
    ...opts,
  })
}

function getOrNull<S extends z.ZodType>(
  net: NetworkId,
  path: string,
  schema: S,
  signal: AbortSignal | undefined,
  opts: { height?: (b: z.output<S>) => number | undefined } = {},
) {
  return fetchSourced({
    source: 'pe',
    net,
    url: () => `${base(net)}${path}`,
    schema,
    notFound: 'null',
    signal,
    ...opts,
  })
}

const statusHeight = (b: PeStatus) => b.tenderdash.block.height

function reportPeLag(net: NetworkId, body: PeStatus, unhealthy: boolean): void {
  const blocks = Math.max(0, body.tenderdash.block.height - body.api.block.height)
  const effective = unhealthy ? Math.max(blocks, PE_STALE_BLOCKS + 1) : blocks
  healthRegistry.setLag(net, 'pe', {
    blocks: effective,
    detail: unhealthy
      ? `Platform Explorer reports its indexer as unhealthy (indexed to block ${formatBlock(body.api.block.height)})`
      : blocks === 0
        ? `indexed to block ${formatBlock(body.api.block.height)}`
        : `indexed to block ${formatBlock(body.api.block.height)} (${blocks} behind)`,
  })
}

export const pe = {
  async status(net: NetworkId, signal?: AbortSignal): Promise<Sourced<PeStatus>> {
    let unhealthy = false
    const out = await fetchSourced({
      source: 'pe',
      net,
      url: () => `${base(net)}/status`,
      schema: PeStatusOrErrorSchema,
      acceptStatus: [503],
      signal,
      height: (b) => ('error' in b ? undefined : statusHeight(b)),
      asOf: (_b, res) => {
        unhealthy = res.status === 503
        return Date.now()
      },
    })
    if ('error' in out.data) {
      const error = new SourceError({
        source: 'pe',
        kind: 'http',
        status: 503,
        message: describeFailure('pe', 'http', 'Platform Explorer is unavailable'),
      })
      healthRegistry.report(net, 'pe', { ok: false, latencyMs: 0, kind: 'http' })
      throw error
    }
    reportPeLag(net, out.data, unhealthy)
    return { ...out, data: out.data }
  },

  epoch(net: NetworkId, index?: number, signal?: AbortSignal): Promise<Sourced<PeEpochDetail>> {
    return get(net, index === undefined ? '/epoch' : `/epoch/${index}`, PeEpochDetailSchema, signal)
  },

  blocks(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeBlockSummary>>> {
    return get(net, `/blocks${search(q)}`, peList(PeBlockSummarySchema), signal, {
      height: (p) => p.items[0]?.header.height,
    })
  },

  block(net: NetworkId, hash: string, signal?: AbortSignal): Promise<Sourced<PeBlock | null>> {
    return getOrNull(net, `/block/${seg(hash)}`, PeBlockSchema, signal, {
      height: (b) => b.header.height,
    })
  },

  transactions(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTransaction>>> {
    return get(net, `/transactions${search(q)}`, peList(PeTransactionSchema), signal)
  },

  transaction(
    net: NetworkId,
    hash: string,
    signal?: AbortSignal,
  ): Promise<Sourced<PeTransaction | null>> {
    return getOrNull(net, `/transaction/${seg(hash)}`, PeTransactionSchema, signal, {
      height: (t) => t.blockHeight ?? undefined,
    })
  },

  identities(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeIdentity>>> {
    return get(net, `/identities${search(q)}`, peList(PeIdentitySchema), signal)
  },

  identity(net: NetworkId, id: string, signal?: AbortSignal): Promise<Sourced<PeIdentity | null>> {
    return getOrNull(net, `/identity/${seg(id)}`, PeIdentitySchema, signal)
  },

  identityTransactions(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTransaction>>> {
    return get(
      net,
      `/identity/${seg(id)}/transactions${search(q)}`,
      peList(PeTransactionSchema),
      signal,
    )
  },

  identityDataContracts(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeDataContract>>> {
    return get(
      net,
      `/identity/${seg(id)}/dataContracts${search(q)}`,
      peList(PeDataContractSchema),
      signal,
    )
  },

  identityDocuments(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeDocument>>> {
    return get(net, `/identity/${seg(id)}/documents${search(q)}`, peList(PeDocumentSchema), signal)
  },

  identityTransfers(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTransfer>>> {
    return get(net, `/identity/${seg(id)}/transfers${search(q)}`, peList(PeTransferSchema), signal)
  },

  identityTokens(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeToken>>> {
    return get(net, `/identity/${seg(id)}/tokens${search(q)}`, peList(PeTokenSchema), signal)
  },

  activeIdentities(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeActiveIdentity>>> {
    return get(net, `/identities/active${search(q)}`, peList(PeActiveIdentitySchema), signal)
  },

  validators(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeValidator>>> {
    return get(net, `/validators${search(q)}`, peList(PeValidatorSchema), signal)
  },

  validator(
    net: NetworkId,
    proTxHash: string,
    signal?: AbortSignal,
  ): Promise<Sourced<PeValidator | null>> {
    return getOrNull(net, `/validator/${seg(proTxHash)}`, PeValidatorSchema, signal)
  },

  validatorEarnings(
    net: NetworkId,
    proTxHash: string,
    timeframe = '30d',
    signal?: AbortSignal,
  ): Promise<Sourced<PeValidatorEarnings | null>> {
    return getOrNull(
      net,
      `/validator/${seg(proTxHash)}/earnings${search({ timeframe })}`,
      PeValidatorEarningsSchema,
      signal,
    )
  },

  validatorBlockStats(
    net: NetworkId,
    proTxHash: string,
    timeframe: PeTimeframe,
    signal?: AbortSignal,
  ) {
    return get(
      net,
      `/validator/${seg(proTxHash)}/stats${search({ timeframe })}`,
      peSeries(PeBlocksCountPointSchema),
      signal,
    )
  },

  validatorRewardStats(
    net: NetworkId,
    proTxHash: string,
    timeframe: PeTimeframe,
    signal?: AbortSignal,
  ) {
    return get(
      net,
      `/validator/${seg(proTxHash)}/rewards/stats${search({ timeframe })}`,
      peSeries(PeRewardPointSchema),
      signal,
    )
  },

  quorums(net: NetworkId, signal?: AbortSignal): Promise<Sourced<PeQuorum[]>> {
    return get(net, '/quorums', z.array(PeQuorumSchema), signal)
  },

  currentQuorum(net: NetworkId, signal?: AbortSignal): Promise<Sourced<PeQuorum>> {
    return get(net, '/quorums/current', PeQuorumSchema, signal)
  },

  dataContracts(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeDataContract>>> {
    return get(net, `/dataContracts${search(q)}`, peList(PeDataContractSchema), signal)
  },

  dataContract(
    net: NetworkId,
    id: string,
    signal?: AbortSignal,
  ): Promise<Sourced<PeDataContract | null>> {
    return getOrNull(net, `/dataContract/${seg(id)}`, PeDataContractSchema, signal)
  },

  dataContractTransactions(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeContractTransaction>>> {
    return get(
      net,
      `/dataContract/${seg(id)}/transactions${search(q)}`,
      peList(PeContractTransactionSchema),
      signal,
    )
  },

  dataContractDocuments(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeDocument>>> {
    return get(
      net,
      `/dataContract/${seg(id)}/documents${search(q)}`,
      peList(PeDocumentSchema),
      signal,
    )
  },

  contractRating(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeContractActivity>>> {
    return get(net, `/dataContracts/rating${search(q)}`, peList(PeContractActivitySchema), signal)
  },

  contractActivity(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeContractActivity>>> {
    return get(net, `/dataContracts/active${search(q)}`, peList(PeContractActivitySchema), signal)
  },

  document(
    net: NetworkId,
    id: string,
    q: { contractId?: string; documentTypeName?: string } = {},
    signal?: AbortSignal,
  ): Promise<Sourced<PeDocument | null>> {
    return getOrNull(
      net,
      `/document/${seg(id)}${search({ contract_id: q.contractId, document_type_name: q.documentTypeName })}`,
      PeDocumentSchema,
      signal,
    )
  },

  documentRevisions(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeDocument>>> {
    return get(net, `/document/${seg(id)}/revisions${search(q)}`, peList(PeDocumentSchema), signal)
  },

  tokens(net: NetworkId, q: PeQuery = {}, signal?: AbortSignal): Promise<Sourced<Page<PeToken>>> {
    return get(net, `/tokens${search(q)}`, peList(PeTokenSchema), signal)
  },

  token(net: NetworkId, id: string, signal?: AbortSignal): Promise<Sourced<PeToken | null>> {
    return getOrNull(net, `/token/${seg(id)}`, PeTokenSchema, signal)
  },

  tokenTransitions(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTokenTransition>>> {
    return get(
      net,
      `/token/${seg(id)}/transitions${search(q)}`,
      peList(PeTokenTransitionSchema),
      signal,
    )
  },

  tokenHolders(
    net: NetworkId,
    id: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTokenHolder>>> {
    return get(net, `/token/${seg(id)}/holders${search(q)}`, peList(PeTokenHolderSchema), signal)
  },

  tokenRating(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTokenRating>>> {
    return get(net, `/tokens/rating${search(q)}`, peList(PeTokenRatingSchema), signal)
  },

  contestedResources(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeContestedResource>>> {
    return get(net, `/contestedResources${search(q)}`, peList(PeContestedResourceSchema), signal)
  },

  contestedResourcesStats(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<Sourced<PeContestedResourcesStats>> {
    return get(net, '/contestedResources/stats', PeContestedResourcesStatsSchema, signal)
  },

  contestedResource(
    net: NetworkId,
    values: readonly string[],
    signal?: AbortSignal,
  ): Promise<Sourced<PeContestedResource | null>> {
    return getOrNull(
      net,
      `/contestedResource/${seg(contestedResourceKey(values))}`,
      PeContestedResourceSchema,
      signal,
    )
  },

  contestedResourceVotes(
    net: NetworkId,
    values: readonly string[],
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeVote>>> {
    return get(
      net,
      `/contestedResource/${seg(contestedResourceKey(values))}/votes${search(q)}`,
      peList(PeVoteSchema),
      signal,
    )
  },

  masternodeVotes(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeVote>>> {
    return get(net, `/masternodes/votes${search(q)}`, peList(PeVoteSchema), signal)
  },

  platformAddresses(
    net: NetworkId,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PePlatformAddress>>> {
    return get(net, `/platformAddresses${search(q)}`, peList(PePlatformAddressSchema), signal)
  },

  platformAddress(
    net: NetworkId,
    address: string,
    signal?: AbortSignal,
  ): Promise<Sourced<PePlatformAddress | null>> {
    return getOrNull(net, `/platformAddress/${seg(address)}/info`, PePlatformAddressSchema, signal)
  },

  platformAddressTransitions(
    net: NetworkId,
    address: string,
    q: PeQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<Page<PeTransaction>>> {
    return get(
      net,
      `/platformAddress/${seg(address)}/transitions${search(q)}`,
      peList(PeTransactionSchema),
      signal,
    )
  },

  transactionsHistory(
    net: NetworkId,
    timeframe: PeTimeframe,
    intervalsCount?: number,
    signal?: AbortSignal,
  ) {
    return get(
      net,
      `/transactions/history${search({ timeframe, intervalsCount })}`,
      peSeries(PeTxHistoryPointSchema),
      signal,
    )
  },

  gasHistory(net: NetworkId, timeframe: PeTimeframe, signal?: AbortSignal) {
    return get(
      net,
      `/transactions/gas/history${search({ timeframe })}`,
      peSeries(PeGasHistoryPointSchema),
      signal,
    )
  },

  identitiesHistory(net: NetworkId, timeframe: PeTimeframe, signal?: AbortSignal) {
    return get(
      net,
      `/identities/history${search({ timeframe })}`,
      peSeries(PeIdentityHistoryPointSchema),
      signal,
    )
  },

  avgBlockTimeHistory(net: NetworkId, signal?: AbortSignal) {
    return get(net, '/blocks/avgBlockTime/history', peSeries(PeAvgBlockTimePointSchema), signal)
  },

  transactionsStatistic(
    net: NetworkId,
    range: { timestampStart?: string; timestampEnd?: string } = {},
    signal?: AbortSignal,
  ): Promise<Sourced<PeTxStatistic>> {
    return get(
      net,
      `/transactions/statistic${search({ timestamp_start: range.timestampStart, timestamp_end: range.timestampEnd })}`,
      PeTxStatisticSchema,
      signal,
    )
  },

  shieldedStatistic(
    net: NetworkId,
    timeframe: PeTimeframe,
    signal?: AbortSignal,
  ): Promise<Sourced<PeShieldedStatistic>> {
    return get(
      net,
      `/transactions/shielded/statistic${search({ timeframe })}`,
      PeShieldedStatisticSchema,
      signal,
    )
  },

  shieldedPool(net: NetworkId, signal?: AbortSignal): Promise<Sourced<PeShieldedPool>> {
    return get(net, '/transactions/shielded/pool', PeShieldedPoolSchema, signal)
  },

  shieldHistory(net: NetworkId, timeframe: PeTimeframe, signal?: AbortSignal) {
    return get(
      net,
      `/transactions/shield/history${search({ timeframe })}`,
      peSeries(PeShieldHistoryPointSchema),
      signal,
    )
  },

  unshieldHistory(net: NetworkId, timeframe: PeTimeframe, signal?: AbortSignal) {
    return get(
      net,
      `/transactions/unshield/history${search({ timeframe })}`,
      peSeries(PeShieldHistoryPointSchema),
      signal,
    )
  },

  /** `Sourced<null>` when nothing matches (PE answers 404). */
  search(net: NetworkId, query: string, signal?: AbortSignal): Promise<Sourced<PeSearch | null>> {
    return getOrNull(net, `/search${search({ query })}`, PeSearchSchema, signal)
  },

  /** Tenderdash CheckTx dry-run for a signed state transition (base64). Not a broadcast. */
  verifyTransaction(
    net: NetworkId,
    base64: string,
    signal?: AbortSignal,
  ): Promise<Sourced<PeVerify>> {
    return fetchSourced({
      source: 'pe',
      net,
      method: 'POST',
      url: () => `${base(net)}/transaction/verify`,
      body: { base64 },
      schema: PeVerifySchema,
      signal,
      timeoutMs: 20_000,
    })
  },
}
