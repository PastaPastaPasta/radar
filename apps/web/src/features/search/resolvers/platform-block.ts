import { msg, t } from '@lingui/core/macro'
import { stampOf } from '@/data/envelope'
import { decentralizedOnly } from '@/lib/source-mode'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import type { Resolver } from '../types'
import { fetchLookup } from './helpers'

/**
 * A Platform block by height. A height inside the Platform tip is a plain link (the height resolver offers it); only
 * when the tip is unknown does it ask Platform Explorer for that one block. A block hash is part of
 * `pe-search`, which also covers transitions and validators in one request.
 */
export const pePlatformBlock: Resolver = {
  id: 'pe-platform-block',
  accepts: ['int'],
  cost: 'index',
  waitsForTip: true,
  what: msg`Platform blocks`,
  async resolve(c, { net, signal, tip }) {
    if (isDevnet(net) || decentralizedOnly() || tip?.platform !== undefined) return []
    const height = Number(c.normalized)
    const [{ peQueries }, { heightLookup }] = await Promise.all([
      import('@/data/pe/queries'),
      import('@/data/pe/blocks-query'),
    ])
    const answer = await fetchLookup(peQueries.blocks(net, heightLookup(height)), signal)
    const block = answer.data.items.find((b) => b.header.height === height)
    if (!block) return []
    const label = formatInt(height)
    return [
      {
        kind: 'platform-block',
        id: String(height),
        title: t`Platform block ${label}`,
        subtitle: t`Platform height`,
        href: { to: '/platform/block/$id', params: { id: String(height) } },
        stamp: stampOf(answer),
        rank: 100,
      },
    ]
  },
}
