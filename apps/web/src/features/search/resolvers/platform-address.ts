import type { Resolver } from '../types'
import { localStamp } from './helpers'

export const platformAddress: Resolver = {
  id: 'local-platform-address',
  accepts: ['platform-address'],
  cost: 'local',
  resolve(c) {
    return Promise.resolve([
      {
        kind: 'platform-address',
        id: c.normalized,
        title: c.normalized,
        subtitle: 'Platform address',
        href: { to: '/platform-address/$addr', params: { addr: c.normalized } },
        stamp: localStamp(),
        rank: 100,
      },
    ])
  },
}
