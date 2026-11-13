import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsvEnum, zDefault, zIsoDate, zLimit, zOpt, zPage } from '@/app/search'
import { ContestsPage } from '@/features/platform'

const defaults = { page: 1, limit: 25 } as const

const contestsSearch = z.object({
  contract: zOpt(z.string()),
  type: zOpt(z.string()),
  status: zOpt(zCsvEnum(['active', 'won', 'locked', 'finished'])),
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
  sort: zOpt(z.string()),
})

export const Route = createFileRoute('/contests')({
  validateSearch: contestsSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-vote', 'contestsPrefetch'),
  component: ContestsPage,
})
