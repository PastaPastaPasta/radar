import { createFileRoute } from '@tanstack/react-router'
import { OfflinePage } from '@/features/you'

export const Route = createFileRoute('/offline')({
  component: OfflinePage,
})
