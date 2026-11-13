import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zIsoDate, zLimit, zOpt, zPage, zRange } from '@/app/search'
import { PlatformBlocksPage } from '@/features/platform'

const defaults = { page: 1, limit: 25, sort: '-height' } as const

const platformBlocksSearch = z.object({
  page: zDefault(zPage, defaults.page),
  limit: zDefault(zLimit, defaults.limit),
  height: zOpt(zRange),
  epoch: zOpt(zRange),
  proposer: zOpt(z.string()),
  gas: zOpt(zRange),
  txs: zOpt(zRange),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
  sort: zDefault(z.string(), defaults.sort),
})

export const Route = createFileRoute('/platform/blocks')({
  validateSearch: platformBlocksSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-blocks', 'platformBlocksPrefetch'),
  component: PlatformBlocksPage,
})
