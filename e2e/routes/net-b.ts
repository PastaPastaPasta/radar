import type { RouteCase } from './types'

const built = true as const
const decentralized = 'partial' as const
const data = 'a[href^="/mn/"]'

export const netB: RouteCase[] = [
  { path: '/masternodes', h1: 'Masternodes', built, decentralized, data },
  { path: '/masternodes?type=evo&view=platform', h1: 'Masternodes', built, decentralized, data },
  {
    path: '/masternodes?reach=unreachable&sort=-uptime_30d',
    h1: 'Masternodes',
    built,
    decentralized,
    data,
  },
  {
    path: '/masternodes?status=enabled&sort=-version&page=2',
    h1: 'Masternodes',
    built,
    decentralized,
    data,
  },
  { path: '/validators', h1: 'Masternodes', built, decentralized, data },
]
