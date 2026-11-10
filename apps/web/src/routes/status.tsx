import { createFileRoute } from '@tanstack/react-router'
import { StatusPage } from '@/features/core'

export const Route = createFileRoute('/status')({
  component: StatusPage,
})
