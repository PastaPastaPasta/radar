import { RoutePlaceholder } from '@/features/entity'

export function NamePage({ label }: { label: string }) {
  return <RoutePlaceholder path="/name/$label" params={{ label }} />
}
