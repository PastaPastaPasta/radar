import { createFileRoute } from '@tanstack/react-router'
import { MapPage } from '@/features/network'

export const Route = createFileRoute('/map')({
  component: MapPage,
})
