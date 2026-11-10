import { RoutePlaceholder } from '@/features/entity'

export function TokenHoldersPage({ id }: { id: string }) {
  return <RoutePlaceholder path="/token/$id/holders" params={{ id }} />
}
