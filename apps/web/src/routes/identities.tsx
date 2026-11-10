import { createFileRoute } from '@tanstack/react-router'
import { IdentitiesPage } from '@/features/platform'

export const Route = createFileRoute('/identities')({
  component: IdentitiesPage,
})
