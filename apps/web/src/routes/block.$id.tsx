import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zPage } from '@/app/search'
import { BlockPage } from '@/features/core'

const blockSearch = z.object({
  page: zPage.optional().catch(undefined),
})

export const Route = createFileRoute('/block/$id')({
  validateSearch: blockSearch,
  component: BlockRoute,
})

function BlockRoute() {
  const { id } = Route.useParams()
  const { page } = Route.useSearch()
  return <BlockPage id={id} page={page} />
}
