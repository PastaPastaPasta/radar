import { createFileRoute } from '@tanstack/react-router'
import { TransitionToolPage } from '@/features/tools'

export const Route = createFileRoute('/tools/transition')({
  component: TransitionToolRoute,
})

function TransitionToolRoute() {
  return <TransitionToolPage />
}
