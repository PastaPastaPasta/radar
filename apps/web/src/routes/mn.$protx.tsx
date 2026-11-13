import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zInt, zOpt } from '@/app/search'
import { MasternodePage } from '@/features/network'

const MN_TABS = ['overview', 'network', 'platform', 'history', 'payments'] as const

const masternodeSearch = z.object({
  tab: zOpt(z.enum(MN_TABS)),
  epoch: zOpt(zInt),
  before: zOpt(zInt),
})

export const Route = createFileRoute('/mn/$protx')({
  validateSearch: masternodeSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-c', 'mnPrefetch'),
  component: MasternodeRoute,
})

function MasternodeRoute() {
  const { protx } = Route.useParams()
  return <MasternodePage protx={protx} />
}
