import { RoutePlaceholder } from '@/features/entity'

export function ContestPage({ label }: { label: string }) {
  return <RoutePlaceholder path="/contest/$label" params={{ label }} />
}
