import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsvEnum, zDefault, zOpt } from '@/app/search'
import { SavedPage } from '@/features/you'

const defaults = { scope: 'network' } as const

const savedSearch = z.object({
  scope: zDefault(z.enum(['network', 'all']), defaults.scope),
  kind: zOpt(zCsvEnum(['identity', 'contract', 'token'])),
})

export const Route = createFileRoute('/saved')({
  validateSearch: savedSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('you', 'savedPrefetch'),
  component: SavedPage,
})
