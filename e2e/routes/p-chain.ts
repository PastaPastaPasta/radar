import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pChain: RouteCase[] = [
  { path: '/epochs', h1: 'Epochs', built: false, decentralized: 'partial' },
  { path: '/protocol', h1: 'Protocol', built: false, decentralized: 'partial' },
  { path: '/quorums', h1: 'Quorums', built: false, decentralized: 'data' },
  { path: '/credits', h1: 'Credits', built: false, decentralized: 'data' },
  { path: '/shielded', h1: 'Shielded pool', built: false, decentralized: 'partial' },
  ...perNet(({ id }) => [
    {
      path: `/epoch/${id('epoch_final', '1234')}`,
      h1: 'Epoch',
      built: false,
      decentralized: 'partial',
    },
  ]),
]
