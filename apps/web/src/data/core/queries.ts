import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { dapiKeys, dataClass, viewKeys } from '../query'
import { core } from './client'
import type { BlockRef, CoreCallOptions, DecodedTx } from './types'

const SETTLED_STALE_MS = 15_000
const LOCKED_STALE_MS = 5 * 60_000

const isLocked = (data: unknown): boolean => {
  const d = data as { chainLocked?: boolean; isChainLocked?: boolean } | null
  return d?.chainLocked === true || d?.isChainLocked === true
}

/**
 * Only an answer that checks out against the request itself (a transaction that hashes to its id) never changes.
 * Whether a block or transaction is ChainLocked is a node's claim until a signature is checked, so it is re-read, less
 * often once two sources agree.
 */
const staleUnlessImmutable = (query: { state: { data: Sourced<unknown> | undefined } }): number => {
  const data = query.state.data
  if (data?.immutable) return Infinity
  return isLocked(data?.data) ? LOCKED_STALE_MS : SETTLED_STALE_MS
}

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
  /** `opts.priority` is how the call queues for budget; it is not part of the query's identity. */
  block: (net: NetworkId, ref: BlockRef, opts?: CoreCallOptions) =>
    queryOptions({
      queryKey: dapiKeys(net, 'block', refKey(ref)),
      queryFn: ({ signal }) => core.block(net, ref, signal, opts),
      ...settled(),
    }),
  tx: (net: NetworkId, txid: string, opts?: CoreCallOptions) =>
    queryOptions({
      queryKey: dapiKeys(net, 'tx', { txid: txid.toLowerCase() }),
      queryFn: ({ signal }) => core.tx(net, txid, signal, opts),
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
  blockRows: (net: NetworkId, q: { fromHeight: number; count: number; via?: 'index' }) =>
    queryOptions({
      queryKey: viewKeys(net, 'block-rows', { from: q.fromHeight, count: q.count, via: q.via }),
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
