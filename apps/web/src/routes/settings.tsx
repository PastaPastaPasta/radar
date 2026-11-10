import { createFileRoute } from '@tanstack/react-router'
import { SettingsRoute } from '@/app/settings-route'
import { prefetchForRoute, prefetchItem, routeNetwork } from '@/data/query'

export const Route = createFileRoute('/settings')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    if (net !== 'mainnet') return
    const { rateQueries } = await import('@/data/rate/queries')
    await prefetchForRoute(context.queryClient, net, [prefetchItem('http', rateQueries.usd())], {
      preload,
    })
  },
  component: SettingsRoute,
})
