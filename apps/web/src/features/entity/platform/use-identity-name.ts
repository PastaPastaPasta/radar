import { useQuery } from '@tanstack/react-query'
import { dataClass, dpnsNameKey } from '@/data/query'
import { useNetwork } from '../network'

/**
 * The DPNS name to show for an identity; absent while it loads, when there is none and when the SDK cannot answer. The
 * batcher loads on first use, so the SDK client stays out of the entry chunk.
 */
export function useIdentityName(id: string): string | undefined {
  const net = useNetwork()
  const { data } = useQuery({
    queryKey: dpnsNameKey(net, id),
    queryFn: async ({ signal }) =>
      (await import('@/data/sdk/batchers')).dpnsName.fetch(net, id, signal),
    ...dataClass('structural'),
  })
  return data?.data ?? undefined
}
