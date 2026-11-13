import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zDefault, zIsoDate, zLimit, zOpt, zPage, zRange } from '@/app/search'
import { IdentitiesPage } from '@/features/platform'

const defaults = { page: 1, limit: 25, sort: '-created' } as const

const identitiesSearch = z.object({
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  sort: zDefault(z.string(), defaults.sort),
  type: zOpt(zCsv),
  bal: zOpt(zRange),
  txs: zOpt(zRange),
  docs: zOpt(zRange),
  contracts: zOpt(zRange),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
})

export const Route = createFileRoute('/identities')({
  validateSearch: identitiesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-id', 'identitiesPrefetch'),
  component: IdentitiesPage,
})
