import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pBlocks: RouteCase[] = [
  { path: '/platform/blocks', h1: 'Platform blocks', built: false, decentralized: 'unavailable' },
  { path: '/platform/txs', h1: 'State transitions', built: false, decentralized: 'unavailable' },
  ...perNet(({ id }) => [
    {
      path: `/platform/block/${id('pblock', '1234')}`,
      h1: 'Platform block',
      built: false,
      decentralized: 'partial',
    },
    {
      path: `/platform/tx/${id('ptx', id('tx_normal', '0'.repeat(64)))}`,
      h1: 'State transition',
      built: false,
      decentralized: 'partial',
    },
  ]),
]
