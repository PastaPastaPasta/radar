import { createFileRoute } from '@tanstack/react-router'
import { StatusPage } from '@/features/core'
import { prefetchForRoute, routeNetwork } from '@/data/query'

export const Route = createFileRoute('/status')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    const { healthProbeItems } = await import('@/data/query/health-probes')
    return prefetchForRoute(context.queryClient, net, healthProbeItems(net), { preload })
  },
  component: StatusPage,
})
