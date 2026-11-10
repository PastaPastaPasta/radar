import { createFileRoute } from '@tanstack/react-router'
import { ContractPage } from '@/features/platform'

export const Route = createFileRoute('/contract/$id/')({
  component: ContractRoute,
})

function ContractRoute() {
  const { id } = Route.useParams()
  return <ContractPage id={id} />
}
