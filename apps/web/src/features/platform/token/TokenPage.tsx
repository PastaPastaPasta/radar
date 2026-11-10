import { RoutePlaceholder } from '@/features/entity'

export function TokenPage({ id }: { id: string }) {
  return <RoutePlaceholder path="/token/$id" params={{ id }} />
}
