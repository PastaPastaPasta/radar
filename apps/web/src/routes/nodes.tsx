import { createFileRoute } from '@tanstack/react-router'
import { NodesPage } from '@/features/network'

export const Route = createFileRoute('/nodes')({
  component: NodesRoute,
})

function NodesRoute() {
  return <NodesPage />
}
