import { useQuery } from '@tanstack/react-query'
import { sdkBatchers } from '@/data/sdk/queries'
import { useNetwork } from '../network'

/** The DPNS name to show for an identity; absent while it loads, when there is none and when the SDK cannot answer. */
export function useIdentityName(id: string): string | undefined {
  const net = useNetwork()
  const { data } = useQuery(sdkBatchers.dpnsName.queryOptions(net, id))
  return data?.data ?? undefined
}
