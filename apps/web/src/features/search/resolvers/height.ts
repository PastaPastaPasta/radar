import type { Resolver, SearchHit } from '../types'
import { localStamp } from './helpers'

const INT = new Intl.NumberFormat('en')

export const heights: Resolver = {
  id: 'local-height',
  accepts: ['int'],
  cost: 'local',
  resolve(c, ctx) {
    const n = Number(c.normalized)
    const label = INT.format(n)
    const tip = ctx.tip
    const hits: SearchHit[] = []
    if (tip?.core === undefined || n <= tip.core) {
      hits.push({
        kind: 'block',
        id: String(n),
        title: `Core block ${label}`,
        subtitle: 'Core height',
        href: { to: '/block/$id', params: { id: String(n) } },
        stamp: localStamp(),
        rank: 80,
      })
    }
    if (tip?.platform === undefined || n <= tip.platform) {
      hits.push({
        kind: 'platform-block',
        id: String(n),
        title: `Platform block ${label}`,
        subtitle: 'Platform height',
        href: { to: '/platform/block/$id', params: { id: String(n) } },
        stamp: localStamp(),
        rank: 80,
      })
    }
    if (tip?.epoch === undefined || n <= tip.epoch) {
      hits.push({
        kind: 'epoch',
        id: String(n),
        title: `Epoch ${label}`,
        subtitle: 'Platform epoch',
        href: { to: '/epoch/$n', params: { n: String(n) } },
        stamp: localStamp(),
        rank: 80,
      })
    }
    return Promise.resolve(hits)
  },
}
