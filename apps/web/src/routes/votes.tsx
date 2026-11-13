import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zIsoDate, zLimit, zOpt, zPage } from '@/app/search'
import { VotesPage } from '@/features/platform'

const defaults = { page: 1, limit: 25 } as const

const votesSearch = z.object({
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  voter: zOpt(z.string()),
  towards: zOpt(z.string()),
  choice: zOpt(z.enum(['towards', 'abstain', 'lock'])),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
})

export const Route = createFileRoute('/votes')({
  validateSearch: votesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-vote', 'votesPrefetch'),
  component: VotesRoute,
})

function VotesRoute() {
  return <VotesPage search={Route.useSearch()} />
}
