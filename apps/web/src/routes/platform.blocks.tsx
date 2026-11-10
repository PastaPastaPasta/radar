import { createFileRoute } from '@tanstack/react-router'
import { PlatformBlocksPage } from '@/features/platform'

export const Route = createFileRoute('/platform/blocks')({
  component: PlatformBlocksPage,
})
