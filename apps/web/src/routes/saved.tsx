import { createFileRoute } from '@tanstack/react-router'
import { SavedPage } from '@/features/you'

export const Route = createFileRoute('/saved')({
  component: SavedPage,
})
