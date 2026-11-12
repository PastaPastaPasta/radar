import { createFileRoute } from '@tanstack/react-router'
import { KitPage } from '@/ui'

function KitRoute() {
  return <KitPage />
}

export const Route = createFileRoute('/__kit')({
  component: KitRoute,
})
