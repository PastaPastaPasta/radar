import { RoutePlaceholder } from '@/features/entity'

export function TransitionPage({ hash }: { hash: string }) {
  return <RoutePlaceholder path="/platform/tx/$hash" params={{ hash }} />
}
