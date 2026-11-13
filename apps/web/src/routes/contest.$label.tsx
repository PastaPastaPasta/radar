import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zOpt, zPage } from '@/app/search'
import { ContestPage } from '@/features/platform'

const defaults = { tab: 'tally', page: 1 } as const

const contestSearch = z.object({
  contract: zOpt(z.string()),
  type: zOpt(z.string()),
  index: zOpt(z.string()),
  tab: zDefault(z.enum(['tally', 'votes', 'raw']), defaults.tab),
  towards: zOpt(z.string()),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/contest/$label')({
  validateSearch: contestSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-vote', 'contestPrefetch'),
  component: ContestPageRoute,
})

function ContestPageRoute() {
  const { label } = Route.useParams()
  return <ContestPage label={label} />
}
