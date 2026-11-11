import { t } from '@lingui/core/macro'
import { getFormatLocale } from '@/lib/format'
import type { Resolver } from '../types'
import { localStamp } from './helpers'

const longDate = (ms: number) =>
  new Intl.DateTimeFormat(getFormatLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(ms)

export const blocksOnDate: Resolver = {
  id: 'local-date',
  accepts: ['date'],
  cost: 'local',
  resolve(c) {
    const label = longDate(Date.parse(`${c.normalized}T00:00:00Z`))
    return Promise.resolve([
      {
        kind: 'block',
        id: `date:${c.normalized}`,
        title: t`Core blocks on ${label}`,
        subtitle: t`UTC day`,
        href: { to: '/blocks', search: { date: c.normalized } },
        stamp: localStamp(),
        rank: 100,
      },
    ])
  },
}
