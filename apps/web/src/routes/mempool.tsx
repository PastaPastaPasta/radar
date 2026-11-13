import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { MempoolPage } from '@/features/core'

export const Route = createFileRoute('/mempool')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    const { mempoolPrefetch } = await import('@/data/query/route-prefetch')
    await prefetchForRoute(context.queryClient, net, mempoolPrefetch(net), { preload })
  },
  component: MempoolPage,
})
