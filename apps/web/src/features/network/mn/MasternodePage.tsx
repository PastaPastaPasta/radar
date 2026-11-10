import { RoutePlaceholder } from '@/features/entity'

export function MasternodePage({ protx }: { protx: string }) {
  return <RoutePlaceholder path="/mn/$protx" params={{ protx }} />
}
