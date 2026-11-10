import { createFileRoute } from '@tanstack/react-router'
import { EpochPage } from '@/features/network'

export const Route = createFileRoute('/epoch/$n')({
  component: EpochRoute,
})

function EpochRoute() {
  const { n } = Route.useParams()
  return <EpochPage n={n} />
}
