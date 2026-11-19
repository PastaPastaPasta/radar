import { queryOptions } from '@tanstack/react-query'
import { dapiKeys, dataClass } from '../query'
import type { NetworkId } from '@/lib/network'
import { platformDapi } from './client'

export const platformDapiQueries = {
  currentQuorums: (net: NetworkId) =>
    queryOptions({
      queryKey: dapiKeys(net, 'current-quorums'),
      queryFn: ({ signal }) => platformDapi.currentQuorums(net, signal),
      ...dataClass('live'),
      // Rereads are paced by the schedule (`nextSetsReadAt`): no read on focus or reconnect, and a refused answer was already tried
      // on a second node inside the client.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    }),
}

export type { CurrentQuorums, PlatformAnswerMeta } from './quorums'
