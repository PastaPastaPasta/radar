import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { V24Page } from '@/features/network'

export const Route = createFileRoute('/v24')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/net-a'),
    (m) => m.v24Prefetch,
  ),
  component: V24Page,
})
