import { RoutePlaceholder } from '@/features/entity'

export function ContractPage({ id }: { id: string }) {
  return <RoutePlaceholder path="/contract/$id" params={{ id }} />
}
