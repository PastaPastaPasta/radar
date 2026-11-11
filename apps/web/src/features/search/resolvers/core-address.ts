import { t } from '@lingui/core/macro'
import type { Resolver } from '../types'
import { localStamp } from './helpers'

export const coreAddress: Resolver = {
  id: 'local-core-address',
  accepts: ['core-address'],
  cost: 'local',
  resolve(c) {
    return Promise.resolve([
      {
        kind: 'address',
        id: c.normalized,
        title: c.normalized,
        subtitle: t`Core address`,
        href: { to: '/address/$address', params: { address: c.normalized } },
        stamp: localStamp(),
        rank: 100,
      },
    ])
  },
}
