import { readFileSync } from 'node:fs'
import { M1_RECORDS } from './m1'
import { perNet, ROUTE_NETS } from './fixtures'
import type { RouteCase } from './types'

const OFFERED = new URL('../../apps/web/src/features/search/offered.ts', import.meta.url)

/**
 * Whether a route's page is built, read from the set search keeps of the pages still on the placeholder. A hit that
 * leads to an unfinished page is never offered, so a spec asserts that hit only once the page has merged.
 */
export function routeBuilt(route: string): boolean {
  const unfinished = new Set(
    [...readFileSync(OFFERED, 'utf8').matchAll(/^\s+'(\/[^']+)',?$/gm)].map((m) => m[1]),
  )
  return !unfinished.has(route)
}

const base = { h1: 'Search', built: true as const }

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
