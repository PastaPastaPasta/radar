import { createFileRoute } from '@tanstack/react-router'
import { TokenHoldersPage } from '@/features/platform'

export const Route = createFileRoute('/token/$id/holders')({
  component: TokenHoldersRoute,
})

function TokenHoldersRoute() {
  const { id } = Route.useParams()
  return <TokenHoldersPage id={id} />
}
