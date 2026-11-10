import { stampOf } from '@/data/envelope'
import type { Resolver } from '../types'

const INT = new Intl.NumberFormat('en')

/** Confirms a height or a block hash against Core, so a block that doesn't exist yields no hit. */
export const dapiBlock: Resolver = {
  id: 'dapi-block',
  accepts: ['int', 'hex64'],
  cost: 'dapi',
  async resolve(c, ctx) {
    const { core } = await import('@/data/core/client')
    const ref = c.classes.includes('hex64')
      ? { hash: c.normalized }
      : { height: Number(c.normalized) }
    const found = await core.block(ctx.net, ref, ctx.signal)
    const block = found.data
    if (!block) return []
    const id = 'hash' in ref ? block.hash : String(block.height)
    return [
      {
        kind: 'block',
        id,
        title: `Core block ${INT.format(block.height)}`,
        subtitle: `${INT.format(block.txs.length)} transactions`,
        href: { to: '/block/$id', params: { id } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}
