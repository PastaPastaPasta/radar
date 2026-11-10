import { RoutePlaceholder } from '@/features/entity'

export function AddressPage({ address }: { address: string }) {
  return <RoutePlaceholder path="/address/$address" params={{ address }} />
}
