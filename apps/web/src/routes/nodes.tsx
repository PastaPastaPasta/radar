import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { NodesPage } from '@/features/network'

const defaults = { scope: 'all', versions: 'now', days: '30' } as const

const nodesSearch = z.object({
  scope: zDefault(z.enum(['all', 'mn', 'evo', 'other']), defaults.scope),
  versions: zDefault(z.enum(['now', 'time']), defaults.versions),
  days: zDefault(z.enum(['1', '7', '30', '90', '365']), defaults.days),
})

export const Route = createFileRoute('/nodes')({
  validateSearch: nodesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/net-a'),
    (m) => m.nodesPrefetch,
  ),
  component: NodesPage,
})
