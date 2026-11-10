import { createFileRoute } from '@tanstack/react-router'
import { ProposalPage } from '@/features/core'

export const Route = createFileRoute('/governance/$hash')({
  component: ProposalRoute,
})

function ProposalRoute() {
  const { hash } = Route.useParams()
  return <ProposalPage hash={hash} />
}
