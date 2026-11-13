import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { TransitionToolPage } from '@/features/tools'

export const Route = createFileRoute('/tools/transition')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/tools'),
    (m) => m.transitionToolPrefetch,
  ),
  component: TransitionToolPage,
})
