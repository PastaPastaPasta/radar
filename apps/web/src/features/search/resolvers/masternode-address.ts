import { t } from '@lingui/core/macro'
import type { Resolver } from '../types'
import { localStamp } from './helpers'

export const masternodeAddress: Resolver = {
  id: 'local-masternode-address',
  accepts: ['ip'],
  cost: 'local',
  resolve(c) {
    return Promise.resolve([
      {
        kind: 'masternode',
        id: `ip:${c.normalized}`,
        title: t`Masternodes at ${c.normalized}`,
        subtitle: t`Service address`,
        href: { to: '/masternodes', search: { q: c.normalized } },
        stamp: localStamp(),
        rank: 80,
      },
    ])
  },
}
