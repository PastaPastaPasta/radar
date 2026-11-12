import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zIsoDate } from '@/app/search'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { BlocksPage } from '@/features/core'

const blocksSearch = z.object({
  date: zIsoDate.optional().catch(undefined),
  from: z.coerce.number().int().min(0).optional().catch(undefined),
  size: z.coerce.number().int().optional().catch(undefined),
})

export const Route = createFileRoute('/blocks')({
  validateSearch: blocksSearch,
  loaderDeps: ({ search }) => ({ network: search.network, net: search.net }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    const { blocksPrefetch } = await import('@/data/query/route-prefetch')
    return prefetchForRoute(context.queryClient, net, blocksPrefetch(net), { preload })
  },
  component: BlocksRoute,
})

function BlocksRoute() {
  const { date, from, size } = Route.useSearch()
  return <BlocksPage date={date} from={from} size={size} />
}
