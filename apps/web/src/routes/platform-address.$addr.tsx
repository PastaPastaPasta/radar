import { createFileRoute } from '@tanstack/react-router'
import { PlatformAddressPage } from '@/features/platform'

export const Route = createFileRoute('/platform-address/$addr')({
  component: PlatformAddressRoute,
})

function PlatformAddressRoute() {
  const { addr } = Route.useParams()
  return <PlatformAddressPage addr={addr} />
}
