import { createFileRoute } from '@tanstack/react-router'
import { MempoolPage } from '@/features/core'

export const Route = createFileRoute('/mempool')({
  component: MempoolRoute,
})

function MempoolRoute() {
  return <MempoolPage />
}
