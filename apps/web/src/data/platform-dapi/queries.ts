import { queryOptions } from '@tanstack/react-query'
import { isSourceError } from '../errors'
import { dapiKeys, dataClass } from '../query'
import type { NetworkId } from '@/lib/network'
import { platformDapi } from './client'

export const platformDapiQueries = {
  currentQuorums: (net: NetworkId) =>
    queryOptions({
      queryKey: dapiKeys(net, 'current-quorums'),
      queryFn: ({ signal }) => platformDapi.currentQuorums(net, signal),
      ...dataClass('live'),
      retry: (n: number, e: unknown) =>
        n < 1 &&
        isSourceError(e) &&
        !['aborted', 'unavailable', 'disabled-by-mode'].includes(e.kind),
    }),
}

export type { CurrentQuorums, PlatformAnswerMeta } from './quorums'
