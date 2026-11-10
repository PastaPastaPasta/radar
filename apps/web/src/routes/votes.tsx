import { createFileRoute } from '@tanstack/react-router'
import { VotesPage } from '@/features/platform'

export const Route = createFileRoute('/votes')({
  component: VotesRoute,
})

function VotesRoute() {
  return <VotesPage />
}
