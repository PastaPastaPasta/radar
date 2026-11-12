import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { GovernancePage } from '@/features/core'
import { isDevnet } from '@/lib/network'

export const Route = createFileRoute('/governance/')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    if (isDevnet(net)) return
    const { proposalsPrefetch } = await import('@/data/query/route-prefetch')
    await prefetchForRoute(context.queryClient, net, proposalsPrefetch(net), { preload })
  },
  component: GovernancePage,
})
