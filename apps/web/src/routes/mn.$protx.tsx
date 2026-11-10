import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { MasternodePage } from '@/features/network'

const MN_TABS = ['overview', 'network', 'platform', 'history', 'payments'] as const

const masternodeSearch = z.object({
  tab: z.enum(MN_TABS).optional().catch(undefined),
})

export const Route = createFileRoute('/mn/$protx')({
  validateSearch: masternodeSearch,
  component: MasternodeRoute,
})

function MasternodeRoute() {
  const { protx } = Route.useParams()
  return <MasternodePage protx={protx} />
}
