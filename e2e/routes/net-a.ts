import type { RouteCase } from './types'
import { H1 } from './claims'

export const netA: RouteCase[] = [
  {
    path: '/nodes',
    h1: H1.nodes,
    decentralized: 'partial',
    data: '[data-dapi-census]',
  },
  {
    path: '/nodes?scope=evo',
    h1: H1.nodes,
    decentralized: 'partial',
    data: '[data-dapi-census]',
  },
  {
    path: '/nodes?versions=time&days=7',
    h1: H1.nodes,
    decentralized: 'partial',
    data: '[data-dapi-census]',
  },
  { path: '/v24', h1: H1.v24, decentralized: 'unavailable' },
]
