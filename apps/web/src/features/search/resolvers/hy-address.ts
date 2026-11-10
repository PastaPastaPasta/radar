import { stampOf } from '@/data/envelope'
import { hyLookups } from '@/data/hyphen/lookups'
import { formatInt } from '@/lib/format'
import { formatAmountText } from '@/lib/units'
import { isDevnet } from '@/lib/network'
import type { Resolver } from '../types'

/**
 * Looks an address up in Hyphen so the hit says what is there: its balance and how many transactions
 * it has. It sends the address to Hyphen, so it is an `index` resolver and never runs for a secret.
 */
export const hyAddress: Resolver = {
  id: 'hy-address',
  accepts: ['core-address'],
  cost: 'index',
  async resolve(c, { net, signal }) {
    if (c.warning || isDevnet(net)) return []
    const found = await hyLookups.address(net, c.normalized, signal)
    const a = found.data
    const balance = a
      ? formatAmountText(a.balance, 'duffs', { testnet: net !== 'mainnet' })
      : undefined
    return [
      {
        kind: 'address',
        id: c.normalized,
        title: c.normalized,
        subtitle: a
          ? `Core address · ${balance ?? ''} · ${formatInt(a.txCount)} ${a.txCount === 1 ? 'transaction' : 'transactions'}`
          : 'Core address · no activity seen',
        href: { to: '/address/$address', params: { address: c.normalized } },
        stamp: stampOf(found),
        rank: 100,
      },
    ]
  },
}
