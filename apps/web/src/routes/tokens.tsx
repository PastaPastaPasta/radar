import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zLimit, zOpt, zPage } from '@/app/search'
import { TokensPage } from '@/features/platform'

const defaults = { page: 1, limit: 25 } as const

const tokensSearch = z.object({
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  sort: zOpt(z.string()),
  owner: zOpt(z.string()),
  contract: zOpt(z.string()),
  q: zOpt(z.string()),
})

export const Route = createFileRoute('/tokens')({
  validateSearch: tokensSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-token'),
    (m) => m.tokensPrefetch,
  ),
  component: TokensPage,
})
