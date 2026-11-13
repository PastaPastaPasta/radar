import type { RouteCase } from './types'

export const netB: RouteCase[] = [
  { path: '/masternodes', h1: 'Masternodes', built: false, decentralized: 'partial' },
  {
    path: '/masternodes?type=evo&view=platform',
    h1: 'Masternodes',
    built: false,
    decentralized: 'partial',
  },
  {
    path: '/masternodes?status=enabled&sort=-version&page=2',
    h1: 'Masternodes',
    built: false,
    decentralized: 'partial',
  },
]
