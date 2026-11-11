import { t } from '@lingui/core/macro'
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
        subtitle: t`A guess: Radar has not checked that this name exists`,
        href: { to: '/name/$label', params: { label } },
        stamp: localStamp(),
        rank: 80,
        speculative: true,
      },
    ])
  },
}
