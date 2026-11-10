import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SearchPage } from '@/features/search'

export const searchPageSearch = z.object({
  q: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/search')({
  validateSearch: searchPageSearch,
  component: SearchRoute,
})

function SearchRoute() {
  const { q } = Route.useSearch()
  return <SearchPage q={q} />
}
