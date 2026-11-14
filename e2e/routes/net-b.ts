import type { RouteCase } from './types'
import { H1 } from './claims'

const decentralized = 'partial' as const
const data = 'a[href^="/mn/"]'

export const netB: RouteCase[] = [
  { path: '/masternodes', h1: H1.masternodes, decentralized, data },
  { path: '/masternodes?type=evo&view=platform', h1: H1.masternodes, decentralized, data },
  {
    path: '/masternodes?reach=unreachable&sort=-uptime_30d',
    h1: H1.masternodes,
    decentralized,
    data,
  },
  {
    path: '/masternodes?status=enabled&sort=-version&page=2',
    h1: H1.masternodes,
    decentralized,
    data,
  },
  { path: '/validators', h1: H1.masternodes, decentralized, data },
]
