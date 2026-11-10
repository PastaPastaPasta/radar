import { createFileRoute } from '@tanstack/react-router'
import { ChangesPage } from '@/features/network'

export const Route = createFileRoute('/changes')({
  component: ChangesRoute,
})

function ChangesRoute() {
  return <ChangesPage />
}
