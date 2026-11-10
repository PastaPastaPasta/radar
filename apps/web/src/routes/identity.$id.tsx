import { createFileRoute } from '@tanstack/react-router'
import { IdentityPage } from '@/features/platform'

export const Route = createFileRoute('/identity/$id')({
  component: IdentityRoute,
})

function IdentityRoute() {
  const { id } = Route.useParams()
  return <IdentityPage id={id} />
}
