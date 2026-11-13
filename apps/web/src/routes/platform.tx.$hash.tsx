import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault } from '@/app/search'
import { TransitionPage } from '@/features/platform'

const defaults = { raw: 'json' } as const

const platformTxSearch = z.object({
  raw: zDefault(z.enum(['json', 'hex', 'base64']), defaults.raw),
})

export const Route = createFileRoute('/platform/tx/$hash')({
  validateSearch: platformTxSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/p-blocks'),
    (m) => m.platformTxPrefetch,
  ),
  component: TransitionPageRoute,
})

function TransitionPageRoute() {
  const { hash } = Route.useParams()
  return <TransitionPage hash={hash} />
}
