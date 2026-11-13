import { M1_RECORDS } from './m1'
import { ROUTE_NETS } from './fixtures'
import type { RouteCase } from './types'

export const uniS: RouteCase[] = ROUTE_NETS.flatMap((net): RouteCase[] => {
  const r = M1_RECORDS[net]
  const base = { h1: 'Search', nets: [net], built: true as const }
  return [
    { ...base, path: '/search', decentralized: 'data' },
    {
      ...base,
      path: `/search?q=${r.height}`,
      decentralized: 'partial',
      data: 'a[href^="/block/"]',
    },
    {
      ...base,
      path: `/search?q=${r.address}`,
      decentralized: 'partial',
      data: 'a[href^="/address/"]',
    },
  ]
})
