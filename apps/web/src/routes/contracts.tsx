import { createFileRoute } from '@tanstack/react-router'
import { ContractsPage } from '@/features/platform'

export const Route = createFileRoute('/contracts')({
  component: ContractsRoute,
})

function ContractsRoute() {
  return <ContractsPage />
}
