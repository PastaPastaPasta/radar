import type { Resolver } from '../types'
import { localStamp } from './helpers'

const FORMAT = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export const blocksOnDate: Resolver = {
  id: 'local-date',
  accepts: ['date'],
  cost: 'local',
  resolve(c) {
    const label = FORMAT.format(new Date(`${c.normalized}T00:00:00Z`))
    return Promise.resolve([
      {
        kind: 'block',
        id: `date:${c.normalized}`,
        title: `Core blocks on ${label}`,
        subtitle: 'UTC day',
        href: { to: '/blocks', search: { date: c.normalized } },
        stamp: localStamp(),
        rank: 100,
      },
    ])
  },
}
