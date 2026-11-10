import { createFileRoute } from '@tanstack/react-router'
import { TransitionPage } from '@/features/platform'

export const Route = createFileRoute('/platform/tx/$hash')({
  component: TransitionRoute,
})

function TransitionRoute() {
  const { hash } = Route.useParams()
  return <TransitionPage hash={hash} />
}
