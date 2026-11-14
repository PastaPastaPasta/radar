import type { RouteCase } from './types'

export const netA: RouteCase[] = [
  {
    path: '/nodes',
    h1: 'Nodes',
    decentralized: 'partial',
    data: '[data-dapi-census]',
  },
  {
    path: '/nodes?scope=evo',
    h1: 'Nodes',
    decentralized: 'partial',
    data: '[data-dapi-census]',
  },
  {
    path: '/nodes?versions=time&days=7',
    h1: 'Nodes',
    decentralized: 'partial',
    data: '[data-dapi-census]',
  },
  { path: '/v24', h1: 'Core 24 activation', decentralized: 'unavailable' },
]
