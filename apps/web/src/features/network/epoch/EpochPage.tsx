import { RoutePlaceholder } from '@/features/entity'

export function EpochPage({ n }: { n: string }) {
  return <RoutePlaceholder path="/epoch/$n" params={{ n }} />
}
