import { createFileRoute } from '@tanstack/react-router'
import { AddressPage } from '@/features/core'

export const Route = createFileRoute('/address/$address')({
  component: AddressRoute,
})

function AddressRoute() {
  const { address } = Route.useParams()
  return <AddressPage address={address} />
}
