import { queryOptions } from '@tanstack/react-query'
import { core } from '@/data/core/client'
import type { DecodedTx } from '@/data/core/types'
import { dataClass, viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'

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
}
