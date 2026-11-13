import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { EpochPage } from '@/features/network'

const defaults = { sort: '-blocks' } as const

const epochSearch = z.object({
  sort: zDefault(z.string(), defaults.sort),
})

export const Route = createFileRoute('/epoch/$n')({
  validateSearch: epochSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-chain'),
    (m) => m.epochPrefetch,
  ),
  component: EpochPageRoute,
})

function EpochPageRoute() {
  const { n } = Route.useParams()
  return <EpochPage n={n} />
}
