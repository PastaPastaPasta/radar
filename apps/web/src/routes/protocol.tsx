import { createFileRoute } from '@tanstack/react-router'
import { ProtocolPage } from '@/features/network'

export const Route = createFileRoute('/protocol')({
  component: ProtocolRoute,
})

function ProtocolRoute() {
  return <ProtocolPage />
}
