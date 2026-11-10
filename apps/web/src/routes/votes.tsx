import { createFileRoute } from '@tanstack/react-router'
import { VotesPage } from '@/features/platform'

export const Route = createFileRoute('/votes')({
  component: VotesPage,
})
