import { perNet } from './fixtures'
import type { RouteCase } from './types'
import { H1 } from './claims'

/**
 * The map draws the land with no request and says once that the crawl is unavailable; the changes list is the
 * crawl's alone; the API reference is static.
 */
export const netD: RouteCase[] = [
  { path: '/map', h1: H1.map, decentralized: 'partial' },
  { path: '/map?layer=nodes&color=version', h1: H1.map, decentralized: 'partial' },
  ...perNet(({ id }) => [
    {
      path: `/map?protx=${id('mn_regular', '0'.repeat(64))}`,
      h1: H1.map,
      decentralized: 'partial',
    },
  ]),
  { path: '/changes', h1: H1.changes, decentralized: 'unavailable' },
  { path: '/changes?kind=pose', h1: H1.changes, decentralized: 'unavailable' },
  { path: '/api', h1: 'Radar API', decentralized: 'data' },
]
