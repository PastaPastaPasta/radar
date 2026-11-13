import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zOpt } from '@/app/search'
import { ShieldedPage } from '@/features/platform'

const defaults = { range: '1w' } as const

const shieldedSearch = z.object({
  range: zDefault(z.enum(['24h', '3d', '1w', '1m']), defaults.range),
  nf: zOpt(z.string()),
})

export const Route = createFileRoute('/shielded')({
  validateSearch: shieldedSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-chain', 'shieldedPrefetch'),
  component: ShieldedPage,
})
