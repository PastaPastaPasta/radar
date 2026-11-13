import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { GroupsPage } from '@/features/platform'

export const Route = createFileRoute('/groups/$contract')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-data'),
    (m) => m.groupsPrefetch,
  ),
  component: GroupsPageRoute,
})

function GroupsPageRoute() {
  const { contract } = Route.useParams()
  return <GroupsPage contract={contract} />
}
