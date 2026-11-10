import { createFileRoute } from '@tanstack/react-router'
import { BlockPage } from '@/features/core'

export const Route = createFileRoute('/block/$id')({
  component: BlockRoute,
})

function BlockRoute() {
  const { id } = Route.useParams()
  return <BlockPage id={id} />
}
