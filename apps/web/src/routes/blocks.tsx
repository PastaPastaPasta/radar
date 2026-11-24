import { createFileRoute, useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { zIsoDate } from '@/app/search'
import { prefetchForRoute, routeNetwork } from '@/data/query'
import { BlocksPage, listWrites } from '@/features/core'

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
  // The list writes the first block in view into `from` as the reader scrolls (the router hears of it); those writes
  // carry the list's own mark and are not navigations, so the list keeps the place it opened at.
  const href = useRouterState({ select: (s) => s.location.pathname + s.location.searchStr })
  const [opened, setOpened] = useState(from)
  if (from !== opened && href !== listWrites.href) setOpened(from)
  // A link to the page already open is no change to the router; it still starts the list over.
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
    opened ?? '',
    size ?? '',
    restart,
  ].join('|')
  return <BlocksPage key={key} date={date} from={opened} size={size} />
}
