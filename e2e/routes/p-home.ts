import type { RouteCase } from './types'
import { H1 } from './claims'

export const pHome: RouteCase[] = [
  { path: '/platform', h1: H1.platform, decentralized: 'partial' },
  { path: '/platform?range=1w&rich=txs', h1: H1.platform, decentralized: 'partial' },
  {
    path: '/status',
    h1: H1.status,
    decentralized: 'data',
    data: '[data-state="off"]',
  },
]
