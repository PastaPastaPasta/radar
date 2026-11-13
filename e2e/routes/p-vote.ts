import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pVote: RouteCase[] = [
  { path: '/names', h1: 'Names', built: false, decentralized: 'partial' },
  { path: '/contests', h1: 'Name contests', built: false, decentralized: 'partial' },
  { path: '/votes', h1: 'Masternode votes', built: false, decentralized: 'unavailable' },
  { path: '/polls', h1: 'Vote polls', built: false, decentralized: 'data' },
  ...perNet(({ id }) => [
    {
      path: `/name/${id('name_registered', 'alice')}`,
      h1: 'Name',
      built: false,
      decentralized: 'data',
    },
    {
      path: `/contest/${id('contest', 'alice')}`,
      h1: 'Name contest',
      built: false,
      decentralized: 'data',
    },
  ]),
]
