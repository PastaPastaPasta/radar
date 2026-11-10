import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zIsoDate } from '@/app/search'
import { BlocksPage } from '@/features/core'

export const blocksSearch = z.object({
  date: zIsoDate.optional().catch(undefined),
})

export const Route = createFileRoute('/blocks')({
  validateSearch: blocksSearch,
  component: BlocksRoute,
})

function BlocksRoute() {
  return <BlocksPage />
}
