import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zInt, zOpt } from '@/app/search'
import { EpochsPage } from '@/features/network'

const epochsSearch = z.object({
  from: zOpt(zInt),
  to: zOpt(zInt),
})

export const Route = createFileRoute('/epochs')({
  validateSearch: epochsSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-chain'),
    (m) => m.epochsPrefetch,
  ),
  component: EpochsPage,
})
