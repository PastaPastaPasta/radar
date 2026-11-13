import { createFileRoute } from '@tanstack/react-router'
import { routePrefetch } from '@/app/route-loader'
import { GroupsPage } from '@/features/platform'

export const Route = createFileRoute('/groups/$contract')({
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-data', 'groupsPrefetch'),
  component: GroupsPageRoute,
})

function GroupsPageRoute() {
  const { contract } = Route.useParams()
  return <GroupsPage contract={contract} />
}
