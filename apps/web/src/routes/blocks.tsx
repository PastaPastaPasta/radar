import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  loaderDeps: ({ search }) => ({
    network: search.network,
    net: search.net,
    latest: search.date === undefined && search.from === undefined,
  }),
  loader: async ({ context, deps, preload }) => {
    const net = routeNetwork(deps)
    const { blocksPrefetch } = await import('@/data/query/route-prefetch')
    return prefetchForRoute(
      context.queryClient,
      net,
      blocksPrefetch(net, { latest: deps.latest, preload }),
      {
        preload,
      },
    )
  },
  component: BlocksRoute,
})

function BlocksRoute() {
  const search = Route.useSearch()
  const { date, from, size } = search
  const router = useRouter()
  // The list notes the reader's place in the URL without telling the router, so a link to the address the router
  // last saw looks like no change to it; such a navigation still starts the list over.
  const [restart, setRestart] = useState(0)
  useEffect(
    () =>
      router.subscribe('onBeforeNavigate', (e) => {
        if (e.toLocation.pathname === '/blocks' && !e.hrefChanged) setRestart((n) => n + 1)
      }),
    [router],
  )
  const key = [
    search.network ?? search.net ?? '',
    date ?? '',
    from ?? '',
    size ?? '',
    restart,
  ].join('|')
  return <BlocksPage key={key} date={date} from={from} size={size} />
}
