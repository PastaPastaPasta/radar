import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zBool01, zDefault, zIsoDate, zLimit, zOpt, zPage, zRange } from '@/app/search'
import { ContractsPage } from '@/features/platform'

const defaults = { page: 1, limit: 25, sort: '-created' } as const

const contractsSearch = z.object({
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  sort: zDefault(z.string(), defaults.sort),
  owner: zOpt(z.string()),
  system: zOpt(zBool01),
  tokens: zOpt(zBool01),
  docs: zOpt(zRange),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
})

export const Route = createFileRoute('/contracts')({
  validateSearch: contractsSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-data'),
    (m) => m.contractsPrefetch,
  ),
  component: ContractsPage,
})
