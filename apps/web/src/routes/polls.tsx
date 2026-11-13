import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zIsoDate, zOpt, zPage } from '@/app/search'
import { PollsPage } from '@/features/platform'

const defaults = { range: '30d', dir: 'asc', page: 1 } as const

const pollsSearch = z.object({
  range: zDefault(z.enum(['24h', '7d', '30d', '90d', 'upcoming', 'custom']), defaults.range),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
  dir: zDefault(z.enum(['asc', 'desc']), defaults.dir),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/polls')({
  validateSearch: pollsSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-vote', 'pollsPrefetch'),
  component: PollsRoute,
})

function PollsRoute() {
  return <PollsPage search={Route.useSearch()} />
}
