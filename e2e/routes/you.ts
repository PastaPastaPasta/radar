import type { RouteCase } from './types'

export const you: RouteCase[] = [
  { path: '/saved', h1: 'Saved', decentralized: 'data' },
  { path: '/saved?scope=all&kind=token', h1: 'Saved', decentralized: 'data' },
  { path: '/about', h1: 'About', decentralized: 'data' },
  // The price feed is offered on mainnet only, so only there does the unit card have something to say.
  {
    path: '/settings',
    h1: 'Settings',
    nets: ['mainnet'],
    decentralized: 'partial',
    data: '#sources',
  },
  {
    path: '/settings',
    h1: 'Settings',
    nets: ['testnet'],
    decentralized: 'data',
    data: '#sources',
  },
]
