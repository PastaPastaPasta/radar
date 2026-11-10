import { createFileRoute } from '@tanstack/react-router'
import { ShieldedPage } from '@/features/platform'

export const Route = createFileRoute('/shielded')({
  component: ShieldedPage,
})
