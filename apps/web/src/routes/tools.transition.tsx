import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { TransitionToolPage } from '@/features/tools'

export const Route = createFileRoute('/tools/transition')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('tools', 'transitionToolPrefetch'),
  component: TransitionToolPage,
})
