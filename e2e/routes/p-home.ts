import type { RouteCase } from './types'

export const pHome: RouteCase[] = [
  { path: '/platform', h1: 'Platform', built: true, decentralized: 'partial' },
  { path: '/platform?range=1w&rich=txs', h1: 'Platform', built: true, decentralized: 'partial' },
  {
    path: '/status',
    h1: 'Status',
    built: true,
    decentralized: 'data',
    data: '[data-state="off"]',
  },
]
