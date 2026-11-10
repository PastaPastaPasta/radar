import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { dapiKeys, dataClass, viewKeys } from '../query'
import { core } from './client'
import type { BlockRef, DecodedTx } from './types'

const SETTLED_STALE_MS = 15_000

/** A chainlocked answer never changes (§5.2 `immutable`); anything else is re-read after a short while. */
const staleUnlessImmutable = (query: { state: { data: Sourced<unknown> | undefined } }): number =>
  query.state.data?.immutable ? Infinity : SETTLED_STALE_MS

const settled = () => ({
  ...dataClass('live'),
  staleTime: staleUnlessImmutable,
  gcTime: dataClass('immutable').gcTime,
})

const refKey = (ref: BlockRef) => ('hash' in ref ? { hash: ref.hash.toLowerCase() } : ref)

export const coreQueries = {
  tip: (net: NetworkId) =>
    queryOptions({
      queryKey: dapiKeys(net, 'tip'),
      queryFn: ({ signal }) => core.tip(net, signal),
      ...dataClass('tip'),
    }),
  chainLock: (net: NetworkId) =>
    queryOptions({
      queryKey: dapiKeys(net, 'chainlock'),
      queryFn: ({ signal }) => core.chainLock(net, signal),
      ...dataClass('tip'),
    }),
  status: (net: NetworkId) =>
    queryOptions({
      queryKey: dapiKeys(net, 'status'),
      queryFn: ({ signal }) => core.status(net, signal),
      ...dataClass('live'),
    }),
  block: (net: NetworkId, ref: BlockRef) =>
    queryOptions({
      queryKey: dapiKeys(net, 'block', refKey(ref)),
      queryFn: ({ signal }) => core.block(net, ref, signal),
      ...settled(),
    }),
  tx: (net: NetworkId, txid: string) =>
    queryOptions({
      queryKey: dapiKeys(net, 'tx', { txid: txid.toLowerCase() }),
      queryFn: ({ signal }) => core.tx(net, txid, signal),
      ...settled(),
    }),
  prevouts: (net: NetworkId, tx: DecodedTx) =>
    queryOptions({
      queryKey: dapiKeys(net, 'prevouts', { txid: tx.txid }),
      queryFn: ({ signal }) => core.prevouts(net, tx, signal),
      ...settled(),
    }),
  headers: (net: NetworkId, fromHeight: number, count: number) =>
    queryOptions({
      queryKey: dapiKeys(net, 'headers', { from: fromHeight, count }),
      queryFn: ({ signal }) => core.headers(net, fromHeight, count, signal),
      ...dataClass('latest'),
    }),
  /** A list page may come from DAPI or from Hyphen, so it is a view, not a DAPI read. */
  blockRows: (net: NetworkId, q: { fromHeight: number; count: number }) =>
    queryOptions({
      queryKey: viewKeys(net, 'block-rows', { from: q.fromHeight, count: q.count }),
      queryFn: ({ signal }) => core.blockRows(net, q, signal),
      ...dataClass('latest'),
    }),
  heightAtTime: (net: NetworkId, ms: number) =>
    queryOptions({
      queryKey: dapiKeys(net, 'height-at-time', { ms }),
      queryFn: ({ signal }) => core.heightAtTime(net, ms, signal),
      ...dataClass('index'),
    }),
  nodeSelfStatus: (net: NetworkId, nodeUrl: string) =>
    queryOptions({
      queryKey: dapiKeys(net, 'node-status', { node: nodeUrl }),
      queryFn: ({ signal }) => core.nodeSelfStatus(net, nodeUrl, signal),
      ...dataClass('live'),
    }),
  masternodeList: (net: NetworkId) =>
    queryOptions({
      queryKey: dapiKeys(net, 'masternode-list'),
      queryFn: ({ signal }) => core.masternodeList(net, signal),
      ...dataClass('structural'),
    }),
}
