import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { AddressPage } from '@/features/core'
import { classify } from '@/features/search'
import { isDevnet } from '@/lib/network'

export const Route = createFileRoute('/address/$address')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, params, preload }) => {
    const net = routeNetwork(deps)
    const checked = classify(params.address, net)
    const elsewhere = checked.networkHint !== undefined && checked.networkHint !== net
    if (isDevnet(net) || elsewhere || !checked.classes.includes('core-address')) return
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
