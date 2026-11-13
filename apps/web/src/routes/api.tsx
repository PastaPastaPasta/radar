import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { ApiPage } from '@/features/tools'

export const Route = createFileRoute('/api')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-d', 'apiPrefetch'),
  component: ApiPage,
})
