import { createFileRoute } from '@tanstack/react-router'
import { EpochsPage } from '@/features/network'

export const Route = createFileRoute('/epochs')({
  component: EpochsPage,
})
