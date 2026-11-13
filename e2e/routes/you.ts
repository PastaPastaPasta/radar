import type { RouteCase } from './types'

export const you: RouteCase[] = [
  { path: '/saved', h1: 'Saved', built: true, decentralized: 'data' },
  { path: '/saved?scope=all&kind=token', h1: 'Saved', built: true, decentralized: 'data' },
  { path: '/about', h1: 'About', built: true, decentralized: 'data' },
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
