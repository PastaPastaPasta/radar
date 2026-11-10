import { createFileRoute } from '@tanstack/react-router'
import { QuorumsPage } from '@/features/platform'

export const Route = createFileRoute('/quorums')({
  component: QuorumsPage,
})
