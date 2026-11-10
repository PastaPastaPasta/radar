import { createFileRoute } from '@tanstack/react-router'
import { ContestsPage } from '@/features/platform'

export const Route = createFileRoute('/contests')({
  component: ContestsRoute,
})

function ContestsRoute() {
  return <ContestsPage />
}
