import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pBlocks: RouteCase[] = [
  { path: '/platform/blocks', h1: 'Platform blocks', built: true, decentralized: 'unavailable' },
  {
    path: '/platform/blocks?epoch=20300..20335&gas=1..500000000',
    h1: 'Platform blocks',
    built: true,
    nets: ['testnet'],
    decentralized: 'unavailable',
  },
  { path: '/platform/txs', h1: 'State transitions', built: true, decentralized: 'unavailable' },
  {
    path: '/platform/txs?type=batch&status=fail',
    h1: 'State transitions',
    built: true,
    decentralized: 'unavailable',
  },
  ...perNet(({ id }) => [
    {
      path: `/platform/block/${id('pblock', '1234')}`,
      h1: 'Platform block',
      built: true,
      decentralized: 'partial',
    },
    {
      path: `/platform/tx/${id('ptx', id('tx_normal', '0'.repeat(64)))}`,
      h1: 'State transition',
      built: true,
      decentralized: 'partial',
    },
    {
      path: `/platform/tx/${id('ptx', id('tx_normal', '0'.repeat(64)))}?raw=hex`,
      h1: 'State transition',
      built: true,
      decentralized: 'partial',
    },
  ]),
]
