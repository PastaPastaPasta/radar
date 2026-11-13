import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { AboutPage } from '@/features/you'

export const Route = createFileRoute('/about')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/you'),
    (m) => m.aboutPrefetch,
  ),
  component: AboutPage,
})
