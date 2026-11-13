import type { RouteCase } from './types'

export const you: RouteCase[] = [
  { path: '/saved', h1: 'Saved', built: false, decentralized: 'data' },
  { path: '/about', h1: 'About', built: false, decentralized: 'data' },
  // The price feed is offered on mainnet only, so only there does the unit card have something to say.
  {
    path: '/settings',
    h1: 'Settings',
    nets: ['mainnet'],
    built: true,
    decentralized: 'partial',
    data: '#sources',
  },
  {
    path: '/settings',
    h1: 'Settings',
    nets: ['testnet'],
    built: true,
    decentralized: 'data',
    data: '#sources',
  },
]
