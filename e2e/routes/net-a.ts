import type { RouteCase } from './types'

export const netA: RouteCase[] = [
  { path: '/nodes', h1: 'Nodes', built: false, decentralized: 'unavailable' },
  {
    path: '/nodes?scope=evo&versions=time&days=90',
    h1: 'Nodes',
    built: false,
    decentralized: 'unavailable',
  },
  { path: '/v24', h1: 'Core 24 activation', built: false, decentralized: 'partial' },
]
