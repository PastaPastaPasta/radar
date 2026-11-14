import { M1_RECORDS } from './m1'
import { perNet, ROUTE_NETS } from './fixtures'
import type { RouteCase } from './types'

const base = { h1: 'Search' }

export const uniS: RouteCase[] = [
  ...ROUTE_NETS.flatMap((net): RouteCase[] => {
    const r = M1_RECORDS[net]
    return [
      { ...base, nets: [net], path: '/search', decentralized: 'data' },
      {
        ...base,
        nets: [net],
        path: `/search?q=${r.height}`,
        decentralized: 'partial',
        data: 'a[href^="/block/"]',
      },
      {
        ...base,
        nets: [net],
        path: `/search?q=${r.address}`,
        decentralized: 'partial',
        data: 'a[href^="/address/"]',
      },
    ]
  }),
  ...perNet((ids) => [
    {
      ...base,
      path: `/search?q=${ids.id('identity', '')}`,
      decentralized: 'partial',
      data: 'a[href^="/identity/"]',
    },
    {
      ...base,
      path: `/search?q=${ids.id('name_registered', '')}`,
      decentralized: 'partial',
    },
    {
      ...base,
      path: `/search?q=${ids.id('epoch_final', '')}`,
      decentralized: 'partial',
      data: 'a[href^="/epoch/"]',
    },
    {
      ...base,
      path: `/search?q=${ids.id('ptx', '').toLowerCase()}`,
      decentralized: 'partial',
      data: 'a[href^="/platform/tx/"]',
    },
    {
      ...base,
      path: `/search?q=${ids.id('pkh', '')}`,
      decentralized: 'data',
      data: 'a[href^="/identity/lookup"]',
    },
    { ...base, path: `/search?q=${ids.paddr()}`, decentralized: 'data' },
  ]),
]
