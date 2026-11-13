import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { throwRedirect } from '@/app/redirect'
import { routePrefetch } from '@/app/route-loader'
import { zInt, zOpt } from '@/app/search'
import { MasternodePage } from '@/features/network'
import { base58Decode, isBase58 } from '@/lib/base58'
import { bytesToHex } from '@/lib/hex'

const MN_TABS = ['overview', 'network', 'platform', 'history', 'payments'] as const

/** An evonode's Platform identity id is its ProTx in base58: the hex of a 32-byte id, or null. */
function protxFromBase58(value: string): string | null {
  if (value.length < 40 || value.length > 46 || !isBase58(value)) return null
  const bytes = base58Decode(value)
  return bytes.length === 32 ? bytesToHex(bytes) : null
}

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
