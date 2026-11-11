import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { HomePage } from '@/features/home'

export const Route = createFileRoute('/')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    const { homePrefetch } = await import('@/data/query/route-prefetch')
    return prefetchForRoute(context.queryClient, net, homePrefetch(net), { preload })
  },
  component: HomePage,
})
