import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { hyKeys } from '../query/keys'
import { dataClass, POLL_MS } from '../query/stale'
import { hyphen } from './client'
import type { HyListQuery } from './params'

export { cursorFromHeight, decodeCursor, type HyCursor, type HyListQuery } from './params'

const params = (q: HyListQuery) => ({ ...q })

const lower = (s: string) => s.toLowerCase()

export const hyQueries = {
  status: (net: NetworkId) =>
    queryOptions({
      queryKey: hyKeys(net, 'status'),
      queryFn: ({ signal }) => hyphen.status(net, signal),
      ...dataClass('index'),
    }),
  blocks: (net: NetworkId, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'blocks', params(q)),
      queryFn: ({ signal }) => hyphen.blocks(net, q, signal),
      ...dataClass('index'),
    }),
  block: (net: NetworkId, hashOrHeight: string | number) =>
    queryOptions({
      queryKey: hyKeys(net, 'block', { id: lower(String(hashOrHeight)) }),
      queryFn: ({ signal }) => hyphen.block(net, hashOrHeight, signal),
      ...dataClass('index'),
    }),
  blockTxs: (net: NetworkId, hashOrHeight: string | number, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'block-txs', { id: lower(String(hashOrHeight)), ...params(q) }),
      queryFn: ({ signal }) => hyphen.blockTxs(net, hashOrHeight, q, signal),
      ...dataClass('index'),
    }),
  rawBlock: (net: NetworkId, hashOrHeight: string | number) =>
    queryOptions({
      queryKey: hyKeys(net, 'raw-block', { id: lower(String(hashOrHeight)) }),
      queryFn: ({ signal }) => hyphen.rawBlock(net, hashOrHeight, signal),
      ...dataClass('index'),
    }),
  tx: (net: NetworkId, txid: string) =>
    queryOptions({
      queryKey: hyKeys(net, 'tx', { txid: lower(txid) }),
      queryFn: ({ signal }) => hyphen.tx(net, txid, signal),
      ...dataClass('index'),
    }),
  rawTx: (net: NetworkId, txid: string) =>
    queryOptions({
      queryKey: hyKeys(net, 'raw-tx', { txid: lower(txid) }),
      queryFn: ({ signal }) => hyphen.rawTx(net, txid, signal),
      ...dataClass('index'),
    }),
  address: (net: NetworkId, address: string) =>
    queryOptions({
      queryKey: hyKeys(net, 'address', { address }),
      queryFn: ({ signal }) => hyphen.address(net, address, signal),
      ...dataClass('index'),
    }),
  addressTxs: (net: NetworkId, address: string, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'address-txs', { address, ...params(q) }),
      queryFn: ({ signal }) => hyphen.addressTxs(net, address, q, signal),
      ...dataClass('index'),
    }),
  addressUtxos: (net: NetworkId, address: string, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'address-utxos', { address, ...params(q) }),
      queryFn: ({ signal }) => hyphen.addressUtxos(net, address, q, signal),
      ...dataClass('index'),
    }),
  balances: (net: NetworkId, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'balances', params(q)),
      queryFn: ({ signal }) => hyphen.balances(net, q, signal),
      ...dataClass('index'),
    }),
  metricsLatest: (net: NetworkId) =>
    queryOptions({
      queryKey: hyKeys(net, 'metrics-latest'),
      queryFn: ({ signal }) => hyphen.metricsLatest(net, signal),
      ...dataClass('index'),
    }),
  metricsChart: (net: NetworkId, q: { blocks?: number; points?: number } = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'metrics-chart', { blocks: q.blocks, points: q.points }),
      queryFn: ({ signal }) => hyphen.metricsChart(net, q, signal),
      ...dataClass('index'),
    }),
  mempool: (net: NetworkId) =>
    queryOptions({
      queryKey: hyKeys(net, 'mempool'),
      queryFn: ({ signal }) => hyphen.mempool(net, signal),
      ...dataClass('latest'),
      refetchInterval: POLL_MS.mempool,
    }),
  mempoolTxs: (net: NetworkId, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'mempool-txs', params(q)),
      queryFn: ({ signal }) => hyphen.mempoolTxs(net, q, signal),
      ...dataClass('latest'),
      refetchInterval: POLL_MS.mempool,
    }),
  network: (net: NetworkId) =>
    queryOptions({
      queryKey: hyKeys(net, 'network'),
      queryFn: ({ signal }) => hyphen.network(net, signal),
      ...dataClass('index'),
    }),
  proposals: (net: NetworkId, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'proposals', params(q)),
      queryFn: ({ signal }) => hyphen.proposals(net, q, signal),
      ...dataClass('index'),
    }),
  proposal: (net: NetworkId, hash: string) =>
    queryOptions({
      queryKey: hyKeys(net, 'proposal', { hash: lower(hash) }),
      queryFn: ({ signal }) => hyphen.proposal(net, hash, signal),
      ...dataClass('index'),
    }),
  proposalVotes: (net: NetworkId, hash: string, q: HyListQuery = {}) =>
    queryOptions({
      queryKey: hyKeys(net, 'proposal-votes', { hash: lower(hash), ...params(q) }),
      queryFn: ({ signal }) => hyphen.proposalVotes(net, hash, q, signal),
      ...dataClass('index'),
    }),
  validators: (
    net: NetworkId,
    q: HyListQuery & { status?: string; type?: 'regular' | 'evonode' } = {},
  ) =>
    queryOptions({
      queryKey: hyKeys(net, 'validators', params(q)),
      queryFn: ({ signal }) => hyphen.validators(net, q, signal),
      ...dataClass('index'),
    }),
  validator: (net: NetworkId, proTxHash: string) =>
    queryOptions({
      queryKey: hyKeys(net, 'validator', { proTxHash: lower(proTxHash) }),
      queryFn: ({ signal }) => hyphen.validator(net, proTxHash, signal),
      ...dataClass('index'),
    }),
  search: (net: NetworkId, q: string) =>
    queryOptions({
      queryKey: hyKeys(net, 'search', { q }),
      queryFn: ({ signal }) => hyphen.search(net, q, signal),
      ...dataClass('index'),
    }),
}
