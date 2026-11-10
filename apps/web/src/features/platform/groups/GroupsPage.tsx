import { RoutePlaceholder } from '@/features/entity'

export function GroupsPage({ contract }: { contract: string }) {
  return <RoutePlaceholder path="/groups/$contract" params={{ contract }} />
}
