import type { RouteCase } from './types'

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const SQL = encodeURIComponent(
  "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' LIMIT 3",
)

export const tools: RouteCase[] = [
  { path: '/query', h1: 'Query', decentralized: 'data', data: '[data-schema-type]' },
  {
    path: `/query?q=${SQL}&contract=${DPNS}`,
    h1: 'Query',
    decentralized: 'data',
    data: '[data-schema-type]',
  },
  {
    path: '/tools/transition',
    h1: 'Transition decoder',
    decentralized: 'partial',
    data: '[data-bytes-field]',
  },
  ...['contract', 'identity', 'document', 'proof'].map((decoder): RouteCase => ({
    path: `/tools/${decoder}`,
    h1: 'Decoder',
    decentralized: 'data',
    data: '[data-bytes-field]',
  })),
  { path: '/tools/path', h1: 'Decoder', decentralized: 'data' },
  {
    path: '/tools/path?preset=root',
    h1: 'Decoder',
    decentralized: 'data',
    data: '[data-path-element]',
  },
  {
    path: '/tools/nope',
    h1: 'Decoders',
    decentralized: 'data',
    data: '[data-decoders]',
  },
  {
    path: '/sdk-reference',
    h1: 'SDK reference',
    decentralized: 'data',
    data: '[data-sdk-pages]',
  },
]
