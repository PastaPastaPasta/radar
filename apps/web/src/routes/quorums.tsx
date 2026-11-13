import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zOpt } from '@/app/search'
import { QuorumsPage } from '@/features/platform'

const quorumsSearch = z.object({
  q: zOpt(z.string()),
  type: zOpt(zCsv),
})

export const Route = createFileRoute('/quorums')({
  validateSearch: quorumsSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-chain'),
    (m) => m.quorumsPrefetch,
  ),
  component: QuorumsPage,
})
