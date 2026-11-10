import { RoutePlaceholder } from '@/features/entity'

export function DocumentsPage({ id, type }: { id: string; type: string }) {
  return <RoutePlaceholder path="/contract/$id/documents/$type" params={{ id, type }} />
}
