import { t } from '@lingui/core/macro'
import { formatInt } from '@/lib/format'
import { decentralizedOnly } from '@/lib/source-mode'
import type { Resolver, SearchHit } from '../types'
import { localStamp } from './helpers'

export const heights: Resolver = {
  id: 'local-height',
  accepts: ['int'],
  cost: 'local',
  resolve(c, ctx) {
    const n = Number(c.normalized)
    const label = formatInt(n)
    const tip = ctx.tip
    const hits: SearchHit[] = []
    if (tip?.core === undefined || n <= tip.core) {
      hits.push({
        kind: 'block',
        id: String(n),
        title: t`Core block ${label}`,
        subtitle: t`Core height`,
        href: { to: '/block/$id', params: { id: String(n) } },
        stamp: localStamp(),
        rank: 80,
      })
    }
    // Platform blocks are read from Platform Explorer alone, so without it a height has no page to open.
    if (tip?.platform !== undefined && n <= tip.platform && !decentralizedOnly()) {
      hits.push({
        kind: 'platform-block',
        id: String(n),
        title: t`Platform block ${label}`,
        subtitle: t`Platform height`,
        href: { to: '/platform/block/$id', params: { id: String(n) } },
        stamp: localStamp(),
        rank: 80,
      })
    }
    if (tip?.epoch !== undefined && n <= tip.epoch) {
      hits.push({
        kind: 'epoch',
        id: String(n),
        title: t`Epoch ${label}`,
        subtitle: t`Platform epoch`,
        href: { to: '/epoch/$n', params: { n: String(n) } },
        stamp: localStamp(),
        rank: 80,
      })
    }
    return Promise.resolve(hits)
  },
}
