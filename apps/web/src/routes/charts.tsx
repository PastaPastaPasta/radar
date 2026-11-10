import { createFileRoute } from '@tanstack/react-router'
import { ChartsPage } from '@/features/core'

export const Route = createFileRoute('/charts')({
  component: ChartsPage,
})
