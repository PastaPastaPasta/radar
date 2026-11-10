import { RoutePlaceholder } from '@/features/entity'

export function IdentityPage({ id }: { id: string }) {
  return <RoutePlaceholder path="/identity/$id" params={{ id }} />
}
