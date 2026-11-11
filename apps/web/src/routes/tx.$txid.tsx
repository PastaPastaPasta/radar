import { createFileRoute } from '@tanstack/react-router'
import { loadBehindFirstPaint } from '@/app/first-load'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { TxPage } from '@/features/core'

export const Route = createFileRoute('/tx/$txid')({
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: ({ context, deps, params, preload }) =>
    loadBehindFirstPaint(
      async (opts) => {
        const net = routeNetwork(deps)
        const { txPrefetch } = await import('@/data/query/route-prefetch')
        return prefetchForRoute(
          context.queryClient,
          net,
          txPrefetch(net, params.txid, preload),
          opts,
        )
      },
      { preload },
    ),
  component: TxRoute,
})

function TxRoute() {
  const { txid } = Route.useParams()
  return <TxPage txid={txid} />
}
