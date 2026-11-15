import { perNet } from './fixtures'
import { recordH1, type RouteCase } from './types'

/** A holder of each network's review token (`scripts/sdk-fixture-picks.json`), whose balance is recorded. */
export const TOKEN_HOLDER = {
  mainnet: '3NQNyo6DAtXxdWjG4pKxyi51yis9k19UgbtYxZSmFrAh',
  testnet: '8eTDkBhpQjHeqgbVeriwLeZr1tCa6yBGw76SckvD1cwc',
} as const

const TOKEN = recordH1('Token')

export const pToken: RouteCase[] = [
  {
    path: '/tokens',
    h1: 'Tokens',
    decentralized: 'unavailable',
    data: '[data-by-contract]',
  },
  ...perNet((ids) => {
    const token = ids.id('token', '0')
    const identity = ids.id('identity', '0')
    const holder = TOKEN_HOLDER[ids.net]
    return [
      {
        path: `/token/${token}`,
        h1: TOKEN,
        decentralized: 'partial',
        data: '[data-token-supply]',
      },
      {
        path: `/token/${token}?tab=definition`,
        h1: TOKEN,
        decentralized: 'data',
        data: '#token-rules',
      },
      {
        path: `/token/${token}?tab=distribution`,
        h1: TOKEN,
        decentralized: 'data',
        data: '#token-distribution',
      },
      {
        path: `/token/${token}?tab=balance&who=${holder}`,
        h1: TOKEN,
        decentralized: 'data',
        data: '[data-field="token-balance"]',
      },
      {
        path: `/token/${token}?tab=activity`,
        h1: TOKEN,
        decentralized: 'unavailable',
      },
      {
        path: `/token/${token}?tab=holders`,
        h1: TOKEN,
        decentralized: 'unavailable',
      },
      {
        path: `/token/${token}/holders?ids=${[holder, identity].sort().join(',')}`,
        h1: 'Token holders',
        decentralized: 'data',
        data: '[data-balance-state="known"]',
      },
      {
        path: `/platform-address/${ids.paddr()}`,
        h1: 'Platform address',
        decentralized: 'partial',
        data: '[data-paddr-balance]',
      },
    ]
  }),
]
