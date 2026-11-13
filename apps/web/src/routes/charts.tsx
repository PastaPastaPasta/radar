import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { throwRedirect } from '@/app/redirect'
import { prefetchForRoute, prefetchItem, routeNetwork } from '@/data/query'
import { ChartsPage } from '@/features/core'
import { isDevnet } from '@/lib/network'

const chartsSearch = z.object({
  range: z.enum(['1h', '1d', '1w', '1m', '1y', 'all']).optional().catch(undefined),
  tab: z.enum(['charts', 'internals']).optional().catch(undefined),
})

export const Route = createFileRoute('/charts')({
  validateSearch: chartsSearch,
  beforeLoad: ({ search }) => {
    if (search.tab !== 'internals') return
    throwRedirect({ to: '/internals', search: { range: search.range } }, search)
  },
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    if (isDevnet(net)) return
    const { hyQueries } = await import('@/data/hyphen/queries')
    await prefetchForRoute(
      context.queryClient,
      net,
      [prefetchItem('http', hyQueries.metricsLatest(net), { wait: true })],
      { preload },
    )
  },
  component: ChartsRoute,
})

function ChartsRoute() {
  const { range } = Route.useSearch()
  return <ChartsPage range={range} />
}
