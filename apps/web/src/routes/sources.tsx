import { createFileRoute } from '@tanstack/react-router'
import { SourcesPage } from '@/features/tools'

export const Route = createFileRoute('/sources')({
  component: SourcesPage,
})
