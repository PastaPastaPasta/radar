import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pToken: RouteCase[] = [
  { path: '/tokens', h1: 'Tokens', built: false, decentralized: 'unavailable' },
  ...perNet((ids) => {
    const token = ids.id('token', '0')
    return [
      { path: `/token/${token}`, h1: 'Token', built: false, decentralized: 'partial' },
      {
        path: `/token/${token}/holders`,
        h1: 'Token holders',
        built: false,
        decentralized: 'unavailable',
      },
      {
        path: `/platform-address/${ids.paddr()}`,
        h1: 'Platform address',
        built: false,
        decentralized: 'data',
      },
    ]
  }),
]
