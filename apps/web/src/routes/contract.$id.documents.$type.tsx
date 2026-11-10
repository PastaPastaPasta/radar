import { createFileRoute } from '@tanstack/react-router'
import { DocumentsPage } from '@/features/platform'

export const Route = createFileRoute('/contract/$id/documents/$type')({
  component: DocumentsRoute,
})

function DocumentsRoute() {
  const { id, type } = Route.useParams()
  return <DocumentsPage id={id} type={type} />
}
