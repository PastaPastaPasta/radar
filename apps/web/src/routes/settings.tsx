import { createFileRoute } from '@tanstack/react-router'
import { SettingsRoute } from '@/app/settings-route'
import { prefetchForRoute, prefetchItem, routeNetwork } from '@/data/query'
import { rateQueries } from '@/data/rate/queries'

export const Route = createFileRoute('/settings')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    return prefetchForRoute(
      context.queryClient,
      net,
      net === 'mainnet' ? [prefetchItem('http', rateQueries.usd())] : [],
      { preload },
    )
  },
  component: SettingsRoute,
})
