import { RoutePlaceholder } from '@/features/entity'

export function DocumentPage({
  contract,
  type,
  id,
}: {
  contract: string
  type: string
  id: string
}) {
  return <RoutePlaceholder path="/document/$contract/$type/$id" params={{ contract, type, id }} />
}
