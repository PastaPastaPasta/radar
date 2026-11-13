import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zOpt } from '@/app/search'
import { QueryPage } from '@/features/tools'

const querySearch = z.object({
  q: zOpt(z.string()),
  contract: zOpt(z.string()),
})

export const Route = createFileRoute('/query')({
  validateSearch: querySearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('tools', 'queryPrefetch'),
  component: QueryPage,
})
