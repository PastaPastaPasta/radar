import { createFileRoute } from '@tanstack/react-router'
import { DocumentPage } from '@/features/platform'

export const Route = createFileRoute('/document/$contract/$type/$id')({
  component: DocumentRoute,
})

function DocumentRoute() {
  const { contract, type, id } = Route.useParams()
  return <DocumentPage contract={contract} type={type} id={id} />
}
