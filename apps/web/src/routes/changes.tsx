import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { ChangesPage } from '@/features/network'

const defaults = { kind: 'all' } as const

const changesSearch = z.object({
  kind: zDefault(z.enum(['all', 'joins', 'pose', 'address', 'keys']), defaults.kind),
})

export const Route = createFileRoute('/changes')({
  validateSearch: changesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-d', 'changesPrefetch'),
  component: ChangesPage,
})
