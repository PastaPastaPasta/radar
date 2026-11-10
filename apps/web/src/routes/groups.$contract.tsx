import { createFileRoute } from '@tanstack/react-router'
import { GroupsPage } from '@/features/platform'

export const Route = createFileRoute('/groups/$contract')({
  component: GroupsRoute,
})

function GroupsRoute() {
  const { contract } = Route.useParams()
  return <GroupsPage contract={contract} />
}
