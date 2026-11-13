import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zOpt, zPage } from '@/app/search'
import { TokenPage } from '@/features/platform'

const defaults = { tab: 'overview', page: 1 } as const

const tokenSearch = z.object({
  tab: zDefault(
    z.enum(['overview', 'definition', 'activity', 'holders', 'distribution', 'balance']),
    defaults.tab,
  ),
  who: zOpt(z.string()),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/token/$id/')({
  validateSearch: tokenSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-token', 'tokenPrefetch'),
  component: TokenPageRoute,
})

function TokenPageRoute() {
  const { id } = Route.useParams()
  return <TokenPage id={id} search={Route.useSearch()} />
}
