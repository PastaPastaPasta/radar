import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pId: RouteCase[] = [
  { path: '/identities', h1: 'Identities', built: false, decentralized: 'unavailable' },
  ...perNet(({ id }) => [
    {
      path: `/identity/lookup?pkh=${id('pkh', '62e907b15cbf27d5425399ebf6f0fb50ebb88f18')}`,
      h1: 'Identity by key hash',
      built: false,
      decentralized: 'data',
    },
    {
      path: `/identity/${id('identity', '0')}`,
      h1: 'Identity',
      built: false,
      decentralized: 'partial',
    },
  ]),
]
