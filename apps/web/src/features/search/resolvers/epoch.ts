import { msg, t } from '@lingui/core/macro'
import { stampOf } from '@/data/envelope'
import { formatDate, formatInt } from '@/lib/format'
import type { Resolver } from '../types'
import { localStamp } from './helpers'

/** Epoch indexes are 16-bit on Platform; the SDK rejects a larger one. */
const MAX_EPOCH = 65_535

/**
 * An epoch by its index. When the current epoch is known, a number inside it is a plain link (the height resolver
 * offers it) and one past it is nothing; only without a tip does it ask Platform, for one proof-checked epoch.
 */
export const sdkEpoch: Resolver = {
  id: 'sdk-epoch',
  accepts: ['int'],
  cost: 'sdk',
  waitsForTip: true,
  what: msg`Platform epochs`,
  async resolve(c, { net, signal, tip }) {
    if (tip?.epoch !== undefined) return []
    const n = Number(c.normalized)
    if (n > MAX_EPOCH) return []
    const { sdk } = await import('@/data/sdk/client')
    const answer = await sdk.call(net, 'epoch.epochsInfo', { startEpoch: n, count: 1 }, signal)
    const epoch = answer.data.find((e) => e.index === n)
    if (!epoch) return []
    const label = formatInt(n)
    const started = formatDate(epoch.firstBlockTimeMs)
    return [
      {
        kind: 'epoch',
        id: String(n),
        title: t`Epoch ${label}`,
        subtitle: t`Started ${started}`,
        href: { to: '/epoch/$n', params: { n: String(n) } },
        stamp: stampOf(answer),
        rank: 100,
      },
    ]
  },
}

/** "epoch 86": the epoch page itself. A number alone could be a height, so only the word makes it an epoch. */
export const epochByName: Resolver = {
  id: 'local-epoch',
  accepts: ['epoch-ref'],
  cost: 'local',
  resolve(c) {
    const n = Number(c.normalized)
    const label = formatInt(n)
    return Promise.resolve([
      {
        kind: 'epoch',
        id: String(n),
        title: t`Epoch ${label}`,
        subtitle: t`Platform epoch`,
        href: { to: '/epoch/$n', params: { n: String(n) } },
        stamp: localStamp(),
        rank: 100,
      },
    ])
  },
}
