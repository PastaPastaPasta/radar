import { RoutePlaceholder } from '@/features/entity'

export function ProposalPage({ hash }: { hash: string }) {
  return <RoutePlaceholder path="/governance/$hash" params={{ hash }} />
}
