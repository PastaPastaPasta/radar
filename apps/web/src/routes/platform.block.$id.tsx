import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zPage } from '@/app/search'
import { PlatformBlockPage } from '@/features/platform'

const defaults = { tab: 'transitions', page: 1 } as const

const platformBlockSearch = z.object({
  tab: zDefault(z.enum(['transitions', 'quorum', 'info']), defaults.tab),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/platform/block/$id')({
  validateSearch: platformBlockSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-blocks', 'platformBlockPrefetch'),
  component: PlatformBlockPageRoute,
})

function PlatformBlockPageRoute() {
  const { id } = Route.useParams()
  return <PlatformBlockPage id={id} />
}
