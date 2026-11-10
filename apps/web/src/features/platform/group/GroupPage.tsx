import { RoutePlaceholder } from '@/features/entity'

export function GroupPage({ contract, pos }: { contract: string; pos: string }) {
  return <RoutePlaceholder path="/group/$contract/$pos" params={{ contract, pos }} />
}
