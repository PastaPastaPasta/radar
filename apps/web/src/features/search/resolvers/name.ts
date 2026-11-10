import type { Resolver } from '../types'
import { localStamp } from './helpers'

export const nameLabel: Resolver = {
  id: 'local-name',
  accepts: ['dpns'],
  cost: 'local',
  resolve(c) {
    const label = c.normalized.replace(/\.dash$/, '')
    return Promise.resolve([
      {
        kind: 'name',
        id: label,
        title: `${label}.dash`,
        subtitle: 'Name',
        href: { to: '/name/$label', params: { label } },
        stamp: localStamp(),
        rank: 80,
      },
    ])
  },
}
