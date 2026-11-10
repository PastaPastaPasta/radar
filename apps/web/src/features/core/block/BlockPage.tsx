import { RoutePlaceholder } from '@/features/entity'

export function BlockPage({ id }: { id: string }) {
  return <RoutePlaceholder path="/block/$id" params={{ id }} />
}
