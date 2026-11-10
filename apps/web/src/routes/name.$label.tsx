import { createFileRoute } from '@tanstack/react-router'
import { NamePage } from '@/features/platform'

export const Route = createFileRoute('/name/$label')({
  component: NameRoute,
})

function NameRoute() {
  const { label } = Route.useParams()
  return <NamePage label={label} />
}
