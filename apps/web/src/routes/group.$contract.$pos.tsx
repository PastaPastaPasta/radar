import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { GroupPage } from '@/features/platform'

const defaults = { tab: 'members', status: 'active' } as const

const groupSearch = z.object({
  tab: zDefault(z.enum(['members', 'actions']), defaults.tab),
  status: zDefault(z.enum(['active', 'closed']), defaults.status),
})

export const Route = createFileRoute('/group/$contract/$pos')({
  validateSearch: groupSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-data'),
    (m) => m.groupPrefetch,
  ),
  component: GroupPageRoute,
})

function GroupPageRoute() {
  const { contract, pos } = Route.useParams()
  return <GroupPage contract={contract} pos={pos} />
}
