import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { throwRedirect } from '@/app/redirect'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { PlatformHomePage } from '@/features/platform'

const LEGACY_ANCHORS: Record<string, '/epochs' | '/protocol' | '/validators'> = {
  now: '/epochs',
  next: '/epochs',
  epochs: '/epochs',
  upgrade: '/protocol',
  all: '/validators',
}

const defaults = { range: '24h', rich: 'balance' } as const

const platformSearch = z.object({
  range: zDefault(z.enum(['24h', '3d', '1w', '1m']), defaults.range),
  rich: zDefault(z.enum(['balance', 'txs']), defaults.rich),
})

export const Route = createFileRoute('/platform/')({
  validateSearch: platformSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  beforeLoad: ({ location, search }) => {
    const to = LEGACY_ANCHORS[location.hash]
    if (to) throwRedirect({ to }, search)
  },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-home', 'platformHomePrefetch'),
  component: PlatformHomeRoute,
})

function PlatformHomeRoute() {
  const { range, rich } = Route.useSearch()
  return <PlatformHomePage range={range} rich={rich} />
}
