import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zPage } from '@/app/search'
import { PlatformAddressPage } from '@/features/platform'

const defaults = { page: 1 } as const

const platformAddressSearch = z.object({
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/platform-address/$addr')({
  validateSearch: platformAddressSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-token'),
    (m) => m.platformAddressPrefetch,
  ),
  component: PlatformAddressPageRoute,
})

function PlatformAddressPageRoute() {
  const { addr } = Route.useParams()
  return <PlatformAddressPage addr={addr} />
}
