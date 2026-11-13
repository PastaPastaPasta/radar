import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { peKeys } from '../query/keys'
import { dataClass, POLL_MS } from '../query/stale'
import { pe } from './client'
import type { PeQuery, PeTimeframe } from './params'

const params = (q: PeQuery): Record<string, string | number | boolean | undefined> => {
  const out: Record<string, string | number | boolean | undefined> = {}
  for (const [k, v] of Object.entries(q)) {
    out[k] = typeof v === 'object' ? [...v].sort().join(',') : v
  }
  return out
}

const list =
  <T>(resource: string, call: (net: NetworkId, q: PeQuery, signal?: AbortSignal) => Promise<T>) =>
  (net: NetworkId, q: PeQuery = {}) =>
    queryOptions({
      queryKey: peKeys(net, resource, params(q)),
      queryFn: ({ signal }) => call(net, q, signal),
      ...dataClass('index'),
    })

const child =
  <T>(
    resource: string,
    call: (net: NetworkId, id: string, q: PeQuery, signal?: AbortSignal) => Promise<T>,
    cls: 'index' | 'structural' = 'index',
  ) =>
  (net: NetworkId, id: string, q: PeQuery = {}) =>
    queryOptions({
      queryKey: peKeys(net, resource, { id, ...params(q) }),
      queryFn: ({ signal }) => call(net, id, q, signal),
      ...dataClass(cls),
    })

const series =
  <T>(
    resource: string,
    call: (net: NetworkId, timeframe: PeTimeframe, signal?: AbortSignal) => Promise<T>,
  ) =>
  (net: NetworkId, timeframe: PeTimeframe) =>
    queryOptions({
      queryKey: peKeys(net, resource, { timeframe }),
      queryFn: ({ signal }) => call(net, timeframe, signal),
      ...dataClass('index'),
    })

export const peQueries = {
  status: (net: NetworkId) =>
    queryOptions({
      queryKey: peKeys(net, 'status'),
      queryFn: ({ signal }) => pe.status(net, signal),
      ...dataClass('index'),
    }),
  epoch: (net: NetworkId, index?: number) =>
    queryOptions({
      queryKey: peKeys(net, 'epoch', { index }),
      queryFn: ({ signal }) => pe.epoch(net, index, signal),
      ...dataClass('index'),
    }),
  blocks: list('blocks', (n, q, sig) => pe.blocks(n, q, sig)),
  latestBlocks: (net: NetworkId, limit = 5) =>
    queryOptions({
      queryKey: peKeys(net, 'blocks-latest', { limit }),
      queryFn: ({ signal }) => pe.blocks(net, { limit, order: 'desc' }, signal),
      ...dataClass('latest'),
      refetchInterval: POLL_MS.peLatest,
    }),
  block: (net: NetworkId, hash: string) =>
    queryOptions({
      queryKey: peKeys(net, 'block', { hash: hash.toLowerCase() }),
      queryFn: ({ signal }) => pe.block(net, hash, signal),
      ...dataClass('index'),
    }),
  transactions: list('transactions', (n, q, sig) => pe.transactions(n, q, sig)),
  latestTransactions: (net: NetworkId, limit = 5) =>
    queryOptions({
      queryKey: peKeys(net, 'transactions-latest', { limit }),
      queryFn: ({ signal }) => pe.transactions(net, { limit, order: 'desc' }, signal),
      ...dataClass('latest'),
      refetchInterval: POLL_MS.peLatest,
    }),
  transaction: (net: NetworkId, hash: string) =>
    queryOptions({
      queryKey: peKeys(net, 'transaction', { hash: hash.toLowerCase() }),
      queryFn: ({ signal }) => pe.transaction(net, hash, signal),
      ...dataClass('index'),
    }),
  /** A dry run (Tenderdash CheckTx), not a broadcast. */
  verifyTransaction: (net: NetworkId, base64: string) =>
    queryOptions({
      queryKey: peKeys(net, 'transaction-verify', { base64 }),
      queryFn: ({ signal }) => pe.verifyTransaction(net, base64, signal),
      ...dataClass('live'),
    }),
  identities: list('identities', (n, q, sig) => pe.identities(n, q, sig)),
  identity: (net: NetworkId, id: string) =>
    queryOptions({
      queryKey: peKeys(net, 'identity', { id }),
      queryFn: ({ signal }) => pe.identity(net, id, signal),
      ...dataClass('index'),
    }),
  identityTransactions: child('identity-transactions', (n, id, q, sig) =>
    pe.identityTransactions(n, id, q, sig),
  ),
  identityDataContracts: child('identity-data-contracts', (n, id, q, sig) =>
    pe.identityDataContracts(n, id, q, sig),
  ),
  identityDocuments: child('identity-documents', (n, id, q, sig) =>
    pe.identityDocuments(n, id, q, sig),
  ),
  identityTransfers: child('identity-transfers', (n, id, q, sig) =>
    pe.identityTransfers(n, id, q, sig),
  ),
  identityTokens: child('identity-tokens', (n, id, q, sig) => pe.identityTokens(n, id, q, sig)),
  activeIdentities: list('identities-active', (n, q, sig) => pe.activeIdentities(n, q, sig)),
  validators: list('validators', (n, q, sig) => pe.validators(n, q, sig)),
  validator: (net: NetworkId, proTxHash: string) =>
    queryOptions({
      queryKey: peKeys(net, 'validator', { proTxHash: proTxHash.toLowerCase() }),
      queryFn: ({ signal }) => pe.validator(net, proTxHash, signal),
      ...dataClass('index'),
    }),
  validatorEarnings: (net: NetworkId, proTxHash: string, timeframe = '30d') =>
    queryOptions({
      queryKey: peKeys(net, 'validator-earnings', {
        proTxHash: proTxHash.toLowerCase(),
        timeframe,
      }),
      queryFn: ({ signal }) => pe.validatorEarnings(net, proTxHash, timeframe, signal),
      ...dataClass('index'),
    }),
  validatorBlockStats: (net: NetworkId, proTxHash: string, timeframe: PeTimeframe) =>
    queryOptions({
      queryKey: peKeys(net, 'validator-block-stats', {
        proTxHash: proTxHash.toLowerCase(),
        timeframe,
      }),
      queryFn: ({ signal }) => pe.validatorBlockStats(net, proTxHash, timeframe, signal),
      ...dataClass('index'),
    }),
  validatorRewardStats: (net: NetworkId, proTxHash: string, timeframe: PeTimeframe) =>
    queryOptions({
      queryKey: peKeys(net, 'validator-reward-stats', {
        proTxHash: proTxHash.toLowerCase(),
        timeframe,
      }),
      queryFn: ({ signal }) => pe.validatorRewardStats(net, proTxHash, timeframe, signal),
      ...dataClass('index'),
    }),
  quorums: (net: NetworkId) =>
    queryOptions({
      queryKey: peKeys(net, 'quorums'),
      queryFn: ({ signal }) => pe.quorums(net, signal),
      ...dataClass('index'),
    }),
  currentQuorum: (net: NetworkId) =>
    queryOptions({
      queryKey: peKeys(net, 'quorum-current'),
      queryFn: ({ signal }) => pe.currentQuorum(net, signal),
      ...dataClass('index'),
    }),
  dataContracts: list('data-contracts', (n, q, sig) => pe.dataContracts(n, q, sig)),
  dataContract: (net: NetworkId, id: string) =>
    queryOptions({
      queryKey: peKeys(net, 'data-contract', { id }),
      queryFn: ({ signal }) => pe.dataContract(net, id, signal),
      ...dataClass('index'),
    }),
  dataContractTransactions: child('data-contract-transactions', (n, id, q, sig) =>
    pe.dataContractTransactions(n, id, q, sig),
  ),
  dataContractDocuments: child('data-contract-documents', (n, id, q, sig) =>
    pe.dataContractDocuments(n, id, q, sig),
  ),
  contractRating: list('data-contracts-rating', (n, q, sig) => pe.contractRating(n, q, sig)),
  contractActivity: list('data-contracts-active', (n, q, sig) => pe.contractActivity(n, q, sig)),
  document: (
    net: NetworkId,
    id: string,
    q: { contractId?: string; documentTypeName?: string } = {},
  ) =>
    queryOptions({
      queryKey: peKeys(net, 'document', { id, contractId: q.contractId, type: q.documentTypeName }),
      queryFn: ({ signal }) => pe.document(net, id, q, signal),
      ...dataClass('index'),
    }),
  documentRevisions: child('document-revisions', (n, id, q, sig) =>
    pe.documentRevisions(n, id, q, sig),
  ),
  tokens: list('tokens', (n, q, sig) => pe.tokens(n, q, sig)),
  token: (net: NetworkId, id: string) =>
    queryOptions({
      queryKey: peKeys(net, 'token', { id }),
      queryFn: ({ signal }) => pe.token(net, id, signal),
      ...dataClass('index'),
    }),
  tokenTransitions: child('token-transitions', (n, id, q, sig) =>
    pe.tokenTransitions(n, id, q, sig),
  ),
  tokenHolders: child('token-holders', (n, id, q, sig) => pe.tokenHolders(n, id, q, sig)),
  tokenRating: list('tokens-rating', (n, q, sig) => pe.tokenRating(n, q, sig)),
  contestedResources: list('contested-resources', (n, q, sig) => pe.contestedResources(n, q, sig)),
  contestedResourcesStats: (net: NetworkId) =>
    queryOptions({
      queryKey: peKeys(net, 'contested-resources-stats'),
      queryFn: ({ signal }) => pe.contestedResourcesStats(net, signal),
      ...dataClass('index'),
    }),
  contestedResource: (net: NetworkId, values: readonly string[]) =>
    queryOptions({
      queryKey: peKeys(net, 'contested-resource', { value: JSON.stringify(values) }),
      queryFn: ({ signal }) => pe.contestedResource(net, values, signal),
      ...dataClass('index'),
    }),
  contestedResourceVotes: (net: NetworkId, values: readonly string[], q: PeQuery = {}) =>
    queryOptions({
      queryKey: peKeys(net, 'contested-resource-votes', {
        value: JSON.stringify(values),
        ...params(q),
      }),
      queryFn: ({ signal }) => pe.contestedResourceVotes(net, values, q, signal),
      ...dataClass('index'),
    }),
  masternodeVotes: list('masternode-votes', (n, q, sig) => pe.masternodeVotes(n, q, sig)),
  platformAddresses: list('platform-addresses', (n, q, sig) => pe.platformAddresses(n, q, sig)),
  platformAddress: (net: NetworkId, address: string) =>
    queryOptions({
      queryKey: peKeys(net, 'platform-address', { address }),
      queryFn: ({ signal }) => pe.platformAddress(net, address, signal),
      ...dataClass('index'),
    }),
  platformAddressTransitions: child('platform-address-transitions', (n, id, q, sig) =>
    pe.platformAddressTransitions(n, id, q, sig),
  ),
  transactionsHistory: (net: NetworkId, timeframe: PeTimeframe, intervalsCount?: number) =>
    queryOptions({
      queryKey: peKeys(net, 'transactions-history', { timeframe, intervalsCount }),
      queryFn: ({ signal }) => pe.transactionsHistory(net, timeframe, intervalsCount, signal),
      ...dataClass('index'),
    }),
  gasHistory: series('gas-history', (n, t, sig) => pe.gasHistory(n, t, sig)),
  identitiesHistory: series('identities-history', (n, t, sig) => pe.identitiesHistory(n, t, sig)),
  avgBlockTimeHistory: (net: NetworkId) =>
    queryOptions({
      queryKey: peKeys(net, 'avg-block-time-history'),
      queryFn: ({ signal }) => pe.avgBlockTimeHistory(net, signal),
      ...dataClass('index'),
    }),
  transactionsStatistic: (
    net: NetworkId,
    range: { timestampStart?: string; timestampEnd?: string } = {},
  ) =>
    queryOptions({
      queryKey: peKeys(net, 'transactions-statistic', {
        start: range.timestampStart,
        end: range.timestampEnd,
      }),
      queryFn: ({ signal }) => pe.transactionsStatistic(net, range, signal),
      ...dataClass('index'),
    }),
  shieldedStatistic: series('shielded-statistic', (n, t, sig) => pe.shieldedStatistic(n, t, sig)),
  shieldedPool: (net: NetworkId) =>
    queryOptions({
      queryKey: peKeys(net, 'shielded-pool'),
      queryFn: ({ signal }) => pe.shieldedPool(net, signal),
      ...dataClass('index'),
    }),
  shieldHistory: series('shield-history', (n, t, sig) => pe.shieldHistory(n, t, sig)),
  unshieldHistory: series('unshield-history', (n, t, sig) => pe.unshieldHistory(n, t, sig)),
  search: (net: NetworkId, query: string) =>
    queryOptions({
      queryKey: peKeys(net, 'search', { query }),
      queryFn: ({ signal }) => pe.search(net, query, signal),
      ...dataClass('index'),
    }),
}
