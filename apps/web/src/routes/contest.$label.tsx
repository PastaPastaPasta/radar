import { createFileRoute } from '@tanstack/react-router'
import { ContestPage } from '@/features/platform'

export const Route = createFileRoute('/contest/$label')({
  component: ContestRoute,
})

function ContestRoute() {
  const { label } = Route.useParams()
  return <ContestPage label={label} />
}
