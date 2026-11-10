import { createFileRoute } from '@tanstack/react-router'
import { PollsPage } from '@/features/platform'

export const Route = createFileRoute('/polls')({
  component: PollsRoute,
})

function PollsRoute() {
  return <PollsPage />
}
