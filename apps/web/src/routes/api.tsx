import { createFileRoute } from '@tanstack/react-router'
import { ApiPage } from '@/features/tools'

export const Route = createFileRoute('/api')({
  component: ApiPage,
})
