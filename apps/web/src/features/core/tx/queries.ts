import { queryOptions } from '@tanstack/react-query'
import { core } from '@/data/core/client'
import type { DecodedTx } from '@/data/core/types'
import { dataClass, viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'

/** Inputs read per step when a long list loads all its amounts: each step is at most this many `getTransaction` calls, four at a time. */
export const PREVOUT_CHUNK = 20

/**
 * The inputs a step reads: those of `from` up to `to` whose parent no earlier input has, together with every later
 * input spending the same parent, so a parent shared across steps is fetched once and all its outputs come back.
 */
export function stepInputs(inputs: DecodedTx['inputs'], from: number, to: number) {
  const earlier = new Set(inputs.slice(0, from).map((input) => input.txid))
  const fresh = new Set(inputs.slice(from, to).map((input) => input.txid))
  return inputs.filter((input) => fresh.has(input.txid) && !earlier.has(input.txid))
}

/**
 * Previous outputs for the first `count` inputs. A transaction with hundreds of inputs would otherwise cost
 * one DAPI request per input before the page could show anything, so the page asks for the rest on demand.
 */
export const txQueries = {
  prevouts: (net: NetworkId, tx: DecodedTx, count: number) =>
    queryOptions({
      queryKey: viewKeys(net, 'tx-prevouts', { txid: tx.txid, count }),
      queryFn: ({ signal }) =>
        core.prevouts(net, { ...tx, inputs: stepInputs(tx.inputs, 0, count) }, signal),
      staleTime: Infinity,
      gcTime: dataClass('immutable').gcTime,
    }),
  /** One step of loading every amount of a long list: inputs `from` up to `to`, read after the step before it. */
  prevoutRange: (net: NetworkId, tx: DecodedTx, from: number, to: number) =>
    queryOptions({
      queryKey: viewKeys(net, 'tx-prevouts', { txid: tx.txid, from, to }),
      queryFn: ({ signal }) =>
        core.prevouts(net, { ...tx, inputs: stepInputs(tx.inputs, from, to) }, signal),
      staleTime: Infinity,
      gcTime: dataClass('immutable').gcTime,
    }),
}
