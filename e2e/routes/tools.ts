import type { RouteCase } from './types'

export const tools: RouteCase[] = [
  { path: '/query', h1: 'Query', built: false, decentralized: 'unavailable' },
  { path: '/tools/transition', h1: 'Transition decoder', built: false, decentralized: 'data' },
  ...['contract', 'identity', 'document', 'proof', 'path'].map((decoder): RouteCase => ({
    path: `/tools/${decoder}`,
    h1: 'Decoder',
    built: false,
    decentralized: 'data',
  })),
  { path: '/sdk-reference', h1: 'SDK reference', built: false, decentralized: 'data' },
]
