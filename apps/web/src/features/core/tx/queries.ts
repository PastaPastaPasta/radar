import { queryOptions } from '@tanstack/react-query'
import { core } from '@/data/core/client'
import type { DecodedTx } from '@/data/core/types'
import { dataClass, viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'

/** Inputs read per step when a long list loads all its amounts: each step is at most this many `getTransaction` calls, four at a time. */
export const PREVOUT_CHUNK = 20

/**
 * Previous outputs for the first `count` inputs. A transaction with hundreds of inputs would otherwise cost
 * one DAPI request per input before the page could show anything, so the page asks for the rest on demand.
 */
export const txQueries = {
  prevouts: (net: NetworkId, tx: DecodedTx, count: number) =>
    queryOptions({
      queryKey: viewKeys(net, 'tx-prevouts', { txid: tx.txid, count }),
      queryFn: ({ signal }) =>
        core.prevouts(net, { ...tx, inputs: tx.inputs.slice(0, count) }, signal),
      staleTime: Infinity,
      gcTime: dataClass('immutable').gcTime,
    }),
  /** One step of loading every amount of a long list: inputs `from` up to `to`, read after the step before it. */
  prevoutRange: (net: NetworkId, tx: DecodedTx, from: number, to: number) =>
    queryOptions({
      queryKey: viewKeys(net, 'tx-prevouts', { txid: tx.txid, from, to }),
      queryFn: ({ signal }) =>
        core.prevouts(net, { ...tx, inputs: tx.inputs.slice(from, to) }, signal),
      staleTime: Infinity,
      gcTime: dataClass('immutable').gcTime,
    }),
}
