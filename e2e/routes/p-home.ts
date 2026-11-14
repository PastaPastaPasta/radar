import type { RouteCase } from './types'

export const pHome: RouteCase[] = [
  { path: '/platform', h1: 'Platform', decentralized: 'partial' },
  { path: '/platform?range=1w&rich=txs', h1: 'Platform', decentralized: 'partial' },
  {
    path: '/status',
    h1: 'Status',
    decentralized: 'data',
    data: '[data-state="off"]',
  },
]
