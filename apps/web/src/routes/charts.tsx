import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ChartsPage } from '@/features/core'

const chartsSearch = z.object({
  range: z.enum(['1h', '1d', '1w', '1m', '1y', 'all']).optional().catch(undefined),
  tab: z.enum(['charts', 'internals']).optional().catch(undefined),
})

export const Route = createFileRoute('/charts')({
  validateSearch: chartsSearch,
  component: ChartsRoute,
})

function ChartsRoute() {
  const { range, tab } = Route.useSearch()
  return <ChartsPage range={range} tab={tab} />
}
