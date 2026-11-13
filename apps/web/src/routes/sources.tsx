import { createFileRoute } from '@tanstack/react-router'
import { SourcesRoute } from '@/app/sources-route'

export const Route = createFileRoute('/sources')({
  component: SourcesRoute,
})
