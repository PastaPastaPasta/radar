import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { loadBehindFirstPaint } from '@/app/first-load'
import { zPage } from '@/app/search'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { BlockPage } from '@/features/core'

const blockSearch = z.object({
  page: zPage.optional().catch(undefined),
})

export const Route = createFileRoute('/block/$id')({
  validateSearch: blockSearch,
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: ({ context, deps, params, preload }) =>
    loadBehindFirstPaint(
      async (opts) => {
        const net = routeNetwork(deps)
        const { blockPrefetch } = await import('@/data/query/route-prefetch')
        return prefetchForRoute(
          context.queryClient,
          net,
          blockPrefetch(net, params.id, preload),
          opts,
        )
      },
      { preload },
    ),
  component: BlockRoute,
})

function BlockRoute() {
  const { id } = Route.useParams()
  const { page } = Route.useSearch()
  return <BlockPage id={id} page={page} />
}
