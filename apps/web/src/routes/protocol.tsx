import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { ProtocolPage } from '@/features/network'

const defaults = { sort: '-version' } as const

const protocolSearch = z.object({
  sort: zDefault(z.string(), defaults.sort),
})

export const Route = createFileRoute('/protocol')({
  validateSearch: protocolSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-chain'),
    (m) => m.protocolPrefetch,
  ),
  component: ProtocolPage,
})
