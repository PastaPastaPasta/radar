import { perNet } from './fixtures'
import type { RouteCase } from './types'

export const pVote: RouteCase[] = [
  { path: '/names', h1: 'Names', built: true, decentralized: 'data' },
  { path: '/names?q=ali', h1: 'Names', built: true, decentralized: 'data' },
  { path: '/contests', h1: 'Name contests', built: true, decentralized: 'partial' },
  { path: '/votes', h1: 'Masternode votes', built: true, decentralized: 'unavailable' },
  { path: '/polls', h1: 'Vote polls', built: true, decentralized: 'data' },
  {
    path: '/polls?range=custom&from=2026-11-01&to=2027-01-31',
    h1: 'Vote polls',
    built: true,
    decentralized: 'data',
  },
  ...perNet(({ id }) => [
    {
      path: `/name/${id('name_registered', 'alice')}`,
      h1: 'Name',
      built: true,
      decentralized: 'data' as const,
      data: '[data-status="registered"]',
    },
    {
      path: `/contest/${id('contest', 'alice')}`,
      h1: 'Name contest',
      built: true,
      decentralized: 'partial' as const,
      data: '[data-contender]',
    },
  ]),
]
