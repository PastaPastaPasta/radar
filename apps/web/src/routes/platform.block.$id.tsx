import { createFileRoute } from '@tanstack/react-router'
import { PlatformBlockPage } from '@/features/platform'

export const Route = createFileRoute('/platform/block/$id')({
  component: PlatformBlockRoute,
})

function PlatformBlockRoute() {
  const { id } = Route.useParams()
  return <PlatformBlockPage id={id} />
}
