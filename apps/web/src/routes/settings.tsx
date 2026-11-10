import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/features/you'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  return <SettingsPage />
}
