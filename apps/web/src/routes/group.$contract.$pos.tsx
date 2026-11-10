import { createFileRoute } from '@tanstack/react-router'
import { GroupPage } from '@/features/platform'

export const Route = createFileRoute('/group/$contract/$pos')({
  component: GroupRoute,
})

function GroupRoute() {
  const { contract, pos } = Route.useParams()
  return <GroupPage contract={contract} pos={pos} />
}
