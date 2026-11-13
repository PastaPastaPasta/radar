import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zOpt } from '@/app/search'
import { NamesPage } from '@/features/platform'

const namesSearch = z.object({
  q: zOpt(z.string()),
  after: zOpt(z.string()),
})

export const Route = createFileRoute('/names')({
  validateSearch: namesSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-vote', 'namesPrefetch'),
  component: NamesPage,
})
