import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zDefault, zOpt, zPage } from '@/app/search'
import { TokenHoldersPage } from '@/features/platform'

const defaults = { page: 1 } as const

const tokenHoldersSearch = z.object({
  ids: zOpt(zCsv),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/token/$id/holders')({
  validateSearch: tokenHoldersSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-token'),
    (m) => m.tokenHoldersPrefetch,
  ),
  component: TokenHoldersPageRoute,
})

function TokenHoldersPageRoute() {
  const { id } = Route.useParams()
  return <TokenHoldersPage id={id} />
}
