import { RoutePlaceholder } from '@/features/entity'

export function PlatformAddressPage({ addr }: { addr: string }) {
  return <RoutePlaceholder path="/platform-address/$addr" params={{ addr }} />
}
