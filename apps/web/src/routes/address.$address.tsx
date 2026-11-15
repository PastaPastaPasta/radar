import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { AddressPage } from '@/features/core'
import { coreAddressNetwork, networkHintFor } from '@/lib/address'
import { isDevnet } from '@/lib/network'

export const Route = createFileRoute('/address/$address')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, params, preload }) => {
    const net = routeNetwork(deps)
    const found = coreAddressNetwork(params.address.trim())
    if (isDevnet(net) || !found || networkHintFor(found, net) !== undefined) return
    const { addressPrefetch } = await import('@/data/query/route-prefetch')
    await prefetchForRoute(context.queryClient, net, addressPrefetch(net, params.address), {
      preload,
    })
  },
  component: AddressRoute,
})

function AddressRoute() {
  const { address } = Route.useParams()
  return <AddressPage address={address} />
}
