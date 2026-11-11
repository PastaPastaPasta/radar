import { createFileRoute } from '@tanstack/react-router'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { TxPage } from '@/features/core'

export const Route = createFileRoute('/tx/$txid')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, params, preload }) => {
    const net = routeNetwork(deps)
    const { txPrefetch } = await import('@/data/query/route-prefetch')
    return prefetchForRoute(context.queryClient, net, txPrefetch(net, params.txid), { preload })
  },
  component: TxRoute,
})

function TxRoute() {
  const { txid } = Route.useParams()
  return <TxPage txid={txid} />
}
