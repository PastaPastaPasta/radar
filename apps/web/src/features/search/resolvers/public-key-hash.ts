import type { Resolver } from '../types'
import { localStamp } from './helpers'

export const publicKeyHash: Resolver = {
  id: 'local-public-key-hash',
  accepts: ['hex40'],
  cost: 'local',
  resolve(c) {
    return Promise.resolve([
      {
        kind: 'identity',
        id: `pkh:${c.normalized}`,
        title: 'Identity with this public-key hash',
        subtitle: c.normalized,
        href: { to: '/identity/lookup', search: { pkh: c.normalized } },
        stamp: localStamp(),
        rank: 100,
      },
    ])
  },
}
