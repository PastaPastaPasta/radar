import { useQueries, useQuery } from '@tanstack/react-query'
import { dataClass, dpnsNameKey } from '@/data/query'
import type { NetworkId } from '@/lib/network'
import { useNetwork } from '../network'

const identityNameQuery = (net: NetworkId, id: string) => ({
  queryKey: dpnsNameKey(net, id),
  queryFn: async ({ signal }: { signal: AbortSignal }) =>
    (await import('@/data/sdk/batchers')).dpnsName.fetch(net, id, signal),
  ...dataClass('structural'),
})

/**
 * The DPNS name to show for an identity; absent while it loads, when there is none and when the SDK cannot answer. The
 * batcher loads on first use, so the SDK client stays out of the entry chunk.
 */
export function useIdentityName(id: string): string | undefined {
  const net = useNetwork()
  const { data } = useQuery(identityNameQuery(net, id))
  return data?.data ?? undefined
}

/** Whether the SDK failed to give the names of these identities, so a list can say its names are missing. Reads the cache entries `useIdentityName` fills. */
export function useIdentityNamesFailed(ids: readonly string[]): boolean {
  const net = useNetwork()
  return useQueries({
    queries: [...new Set(ids)].map((id) => identityNameQuery(net, id)),
    combine: (results) => results.some((r) => r.isError),
  })
}
