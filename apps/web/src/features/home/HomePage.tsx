import { RoutePlaceholder } from '@/features/entity'
import { SearchTrigger } from '@/features/search'

export function HomePage() {
  return (
    <RoutePlaceholder path="/" heading="Radar">
      <SearchTrigger label="Search blocks, transactions, masternodes, names" />
    </RoutePlaceholder>
  )
}
