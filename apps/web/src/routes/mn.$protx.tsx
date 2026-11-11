import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { loadBehindFirstPaint } from '@/app/first-load'
import { prefetchForRoute, prefetchItem, routeNetwork } from '@/data/query'
import { radarQueries } from '@/data/radar/queries'
import { MasternodePage } from '@/features/network'
import { isDevnet } from '@/lib/network'

const MN_TABS = ['overview', 'network', 'platform', 'history', 'payments'] as const

const masternodeSearch = z.object({
  tab: z.enum(MN_TABS).optional().catch(undefined),
})

const PROTX = /^[0-9a-f]{64}$/i

export const Route = createFileRoute('/mn/$protx')({
  validateSearch: masternodeSearch,
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: ({ context, deps, params, preload }) => {
    const net = routeNetwork(deps)
    if (isDevnet(net) || !PROTX.test(params.protx)) return
    return loadBehindFirstPaint(
      (opts) =>
        prefetchForRoute(
          context.queryClient,
          net,
          [prefetchItem('http', radarQueries.masternode(net, params.protx), { wait: true })],
          opts,
        ),
      { preload },
    )
  },
  component: MasternodeRoute,
})

function MasternodeRoute() {
  const { protx } = Route.useParams()
  return <MasternodePage protx={protx} />
}
