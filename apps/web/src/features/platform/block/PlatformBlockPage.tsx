import { RoutePlaceholder } from '@/features/entity'

export function PlatformBlockPage({ id }: { id: string }) {
  return <RoutePlaceholder path="/platform/block/$id" params={{ id }} />
}
