import { stampOf } from '@/data/envelope'
import type { Resolver } from '../types'

const INT = new Intl.NumberFormat('en')

/** Confirms a 64-character hash is a transaction on this network. */
export const dapiTx: Resolver = {
  id: 'dapi-tx',
  accepts: ['hex64'],
  cost: 'dapi',
  async resolve(c, ctx) {
    const { core } = await import('@/data/core/client')
    const found = await core.tx(ctx.net, c.normalized, ctx.signal)
    const tx = found.data
    if (!tx) return []
    const { height } = tx
    return [
      {
        kind: 'tx',
        id: tx.txid,
        title: `Transaction ${tx.txid.slice(0, 10)}…${tx.txid.slice(-6)}`,
        subtitle:
          height === undefined
            ? 'Core transaction, unconfirmed'
            : `Core transaction in block ${INT.format(height)}`,
        href: { to: '/tx/$txid', params: { txid: tx.txid } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}
