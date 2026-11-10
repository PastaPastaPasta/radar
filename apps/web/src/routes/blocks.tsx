import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zIsoDate } from '@/app/search'
import { BlocksPage } from '@/features/core'

const blocksSearch = z.object({
  date: zIsoDate.optional().catch(undefined),
  from: z.coerce.number().int().min(0).optional().catch(undefined),
})

export const Route = createFileRoute('/blocks')({
  validateSearch: blocksSearch,
  component: BlocksRoute,
})

function BlocksRoute() {
  const { date, from } = Route.useSearch()
  return <BlocksPage date={date} from={from} />
}
