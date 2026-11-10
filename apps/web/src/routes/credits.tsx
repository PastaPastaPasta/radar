import { createFileRoute } from '@tanstack/react-router'
import { CreditsPage } from '@/features/platform'

export const Route = createFileRoute('/credits')({
  component: CreditsRoute,
})

function CreditsRoute() {
  return <CreditsPage />
}
