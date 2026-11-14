import { perNet } from './fixtures'
import type { RouteCase } from './types'

/** The custom range the route sweep opens: the last six epochs up to the finalized one. */
const RANGE_BACK = 5

export const pChain: RouteCase[] = [
  {
    path: '/epochs',
    h1: 'Epochs',
    decentralized: 'partial',
    data: '#current-epoch [role="meter"]',
  },
  ...perNet(({ id }) => {
    const last = Number(id('epoch_final', '86'))
    return [
      {
        path: `/epochs?from=${last - RANGE_BACK}&to=${last}`,
        h1: 'Epochs',
        decentralized: 'partial' as const,
        data: '#range tbody tr, #range [data-card]',
      },
    ]
  }),
  {
    path: '/protocol',
    h1: 'Protocol',
    decentralized: 'partial',
    data: '#vote [role="meter"]',
  },
  {
    path: '/quorums',
    h1: 'Quorums',
    decentralized: 'data',
    data: '#quorums [data-quorum-hash]',
  },
  {
    path: '/credits',
    h1: 'Credits',
    decentralized: 'data',
    data: '#total-credits [data-amount]',
  },
  {
    path: '/shielded',
    h1: 'Shielded pool',
    decentralized: 'partial',
    data: '#pool [data-amount]',
  },
  ...perNet(({ id }) => [
    {
      path: `/epoch/${id('epoch_final', '1234')}`,
      h1: 'Epoch',
      decentralized: 'data' as const,
      data: '#epoch-totals dl',
    },
  ]),
]
