import { createFileRoute } from '@tanstack/react-router'
import { SettingsRoute } from '@/app/settings-route'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
})
