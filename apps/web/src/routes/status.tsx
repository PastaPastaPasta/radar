import { createFileRoute } from '@tanstack/react-router'
import { StatusPage } from '@/features/core'
import { healthProbeItems } from '@/data/query/health-probes'
import { prefetchForRoute, routeNetwork } from '@/data/query'

export const Route = createFileRoute('/status')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    return prefetchForRoute(context.queryClient, net, healthProbeItems(net), { preload })
  },
  component: StatusPage,
})
