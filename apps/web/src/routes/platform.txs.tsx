import { createFileRoute } from '@tanstack/react-router'
import { TransitionsPage } from '@/features/platform'

export const Route = createFileRoute('/platform/txs')({
  component: TransitionsRoute,
})

function TransitionsRoute() {
  return <TransitionsPage />
}
