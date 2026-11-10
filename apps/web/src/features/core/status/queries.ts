import { queryOptions } from '@tanstack/react-query'
import type { CoreClient } from '@/data/core/types'
import { dapiKeys, dataClass, viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'

const TIP_POLL_MS = 30_000

/**
 * Core tip, best ChainLock and chain status for the status page, read through the Core façade.
 * The tip and ChainLock keys are the ones the live stream writes into (§4.6), so a push shows up here.
 */
export function statusQueries(core: CoreClient) {
  return {
    tip: (net: NetworkId) =>
      queryOptions({
        queryKey: dapiKeys(net, 'tip'),
        queryFn: ({ signal }) => core.tip(net, signal),
        ...dataClass('tip'),
        refetchInterval: TIP_POLL_MS,
      }),
    chainLock: (net: NetworkId) =>
      queryOptions({
        queryKey: dapiKeys(net, 'chainlock'),
        queryFn: ({ signal }) => core.chainLock(net, signal),
        ...dataClass('tip'),
        refetchInterval: TIP_POLL_MS,
      }),
    chain: (net: NetworkId) =>
      queryOptions({
        queryKey: viewKeys(net, 'core-status'),
        queryFn: ({ signal }) => core.status(net, signal),
        ...dataClass('live'),
        refetchInterval: TIP_POLL_MS,
      }),
  }
}
