import { createFileRoute } from '@tanstack/react-router'
import { GovernancePage } from '@/features/core'

export const Route = createFileRoute('/governance/')({
  component: GovernanceRoute,
})

function GovernanceRoute() {
  return <GovernancePage />
}
