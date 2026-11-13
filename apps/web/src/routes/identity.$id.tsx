import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zDefault, zOpt, zPage } from '@/app/search'
import { IdentityPage } from '@/features/platform'

const defaults = { tab: 'overview', page: 1 } as const

const identitySearch = z.object({
  tab: zDefault(
    z.enum([
      'overview',
      'keys',
      'names',
      'tokens',
      'groups',
      'votes',
      'transactions',
      'contracts',
      'documents',
      'transfers',
      'advanced',
    ]),
    defaults.tab,
  ),
  page: zDefault(zPage, defaults.page),
  contract: zOpt(z.string()),
  type: zOpt(z.string()),
  tokens: zOpt(zCsv),
})

export const Route = createFileRoute('/identity/$id')({
  validateSearch: identitySearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-id'),
    (m) => m.identityPrefetch,
  ),
  component: IdentityPageRoute,
})

function IdentityPageRoute() {
  const { id } = Route.useParams()
  return <IdentityPage id={id} />
}
