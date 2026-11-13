import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { throwRedirect } from '@/app/redirect'
import { routePrefetch } from '@/app/route-loader'
import { zInt, zOpt } from '@/app/search'
import { MasternodePage, MN_TABS, protxFromBase58 } from '@/features/network'

const masternodeSearch = z.object({
  tab: zOpt(z.enum(MN_TABS)),
  epoch: zOpt(zInt),
  before: zOpt(zInt),
})

export const Route = createFileRoute('/mn/$protx')({
  validateSearch: masternodeSearch,
  loaderDeps: ({ search }) => search,
  beforeLoad: ({ params, search }) => {
    const hex = protxFromBase58(params.protx)
    if (hex) throwRedirect({ to: '/mn/$protx', params: { protx: hex }, search }, search)
  },
  loader: routePrefetch('net-c', 'mnPrefetch'),
  component: MasternodeRoute,
})

function MasternodeRoute() {
  const { protx } = Route.useParams()
  const { tab, epoch, before } = Route.useSearch()
  return <MasternodePage protx={protx} tab={tab} epoch={epoch} before={before} />
}
