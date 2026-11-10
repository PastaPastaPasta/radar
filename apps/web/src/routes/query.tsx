import { createFileRoute } from '@tanstack/react-router'
import { QueryPage } from '@/features/tools'

export const Route = createFileRoute('/query')({
  component: QueryPage,
})
