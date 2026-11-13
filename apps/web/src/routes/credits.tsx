import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zOpt } from '@/app/search'
import { CreditsPage } from '@/features/platform'

const creditsSearch = z.object({
  id: zOpt(z.string()),
})

export const Route = createFileRoute('/credits')({
  validateSearch: creditsSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-chain', 'creditsPrefetch'),
  component: CreditsPage,
})
