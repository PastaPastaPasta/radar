import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, prefetchItem, routeNetwork } from '@/data/query'
import { RichListPage } from '@/features/core'
import { isDevnet } from '@/lib/network'

export const Route = createFileRoute('/rich-list')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    if (isDevnet(net)) return
    const { hyQueries } = await import('@/data/hyphen/queries')
    await prefetchForRoute(
      context.queryClient,
      net,
      [prefetchItem('http', hyQueries.balances(net, { limit: 100 }), { wait: true })],
      { preload },
    )
  },
  component: RichListPage,
})
