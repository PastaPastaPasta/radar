import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pId: RouteCase[] = [
  { path: '/identities', h1: 'Identities', decentralized: 'unavailable' },
  {
    path: '/identities?sort=-balance',
    h1: 'Identities',
    decentralized: 'unavailable',
  },
  ...perNet(({ id, net }) => [
    {
      // The mainnet hash belongs to one identity, so the page opens it; the testnet hash is shared and stays a list.
      path: `/identity/lookup?pkh=${id('pkh', '62e907b15cbf27d5425399ebf6f0fb50ebb88f18')}`,
      h1: net === 'mainnet' ? 'Identity' : 'Identity by key hash',
      decentralized: net === 'mainnet' ? ('partial' as const) : ('data' as const),
    },
    {
      path: `/identity/${id('identity', '0')}`,
      h1: 'Identity',
      decentralized: 'partial' as const,
      data: '[data-field="balance"]',
    },
    ...(['keys', 'names', 'tokens', 'groups', 'votes', 'advanced'] as const).map((tab) => ({
      path: `/identity/${id('identity', '0')}?tab=${tab}`,
      h1: 'Identity',
      decentralized: tab === 'tokens' ? ('partial' as const) : ('data' as const),
    })),
    ...(['transactions', 'contracts', 'documents', 'transfers'] as const).map((tab) => ({
      path: `/identity/${id('identity', '0')}?tab=${tab}`,
      h1: 'Identity',
      decentralized: 'partial' as const,
    })),
  ]),
]
