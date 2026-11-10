import { createFileRoute } from '@tanstack/react-router'
import { RichListPage } from '@/features/core'

export const Route = createFileRoute('/rich-list')({
  component: RichListRoute,
})

function RichListRoute() {
  return <RichListPage />
}
