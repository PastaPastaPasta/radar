import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { V24Page } from '@/features/network'

export const Route = createFileRoute('/v24')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-a', 'v24Prefetch'),
  component: V24Page,
})
