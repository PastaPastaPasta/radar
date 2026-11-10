import { queryOptions } from '@tanstack/react-query'
import type { BlockRef, CoreClient } from '@/data/core/types'
import { dataClass, viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'

/** Hover-card reads through the Core façade: DAPI first, with the façade's own Hyphen fallback. */
export function coreCardQueries(core: CoreClient) {
  return {
    block: (net: NetworkId, ref: BlockRef) =>
      queryOptions({
        queryKey: viewKeys(net, 'card-block', { id: 'hash' in ref ? ref.hash : ref.height }),
        queryFn: ({ signal }) => core.block(net, ref, signal),
        ...dataClass('live'),
      }),
    tx: (net: NetworkId, txid: string) =>
      queryOptions({
        queryKey: viewKeys(net, 'card-tx', { id: txid.toLowerCase() }),
        queryFn: ({ signal }) => core.tx(net, txid.toLowerCase(), signal),
        ...dataClass('live'),
      }),
  }
}
