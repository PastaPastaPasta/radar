import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, prefetchItem, routeNetwork } from '@/data/query'
import { GovernancePage } from '@/features/core'
import { isDevnet } from '@/lib/network'

export const Route = createFileRoute('/governance/')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    if (isDevnet(net)) return
    const { hyQueries } = await import('@/data/hyphen/queries')
    await prefetchForRoute(
      context.queryClient,
      net,
      [prefetchItem('http', hyQueries.proposals(net, { limit: 100 }), { wait: true })],
      { preload },
    )
  },
  component: GovernancePage,
})
