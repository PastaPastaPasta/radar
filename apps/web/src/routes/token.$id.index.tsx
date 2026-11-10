import { createFileRoute } from '@tanstack/react-router'
import { TokenPage } from '@/features/platform'

export const Route = createFileRoute('/token/$id/')({
  component: TokenRoute,
})

function TokenRoute() {
  const { id } = Route.useParams()
  return <TokenPage id={id} />
}
