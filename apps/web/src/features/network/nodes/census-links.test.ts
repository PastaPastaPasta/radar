import { describe, expect, it } from 'vitest'
import { filterMnRows } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'
import type { CensusScope } from './census-math'
import { countryLink, hostLink, reachableLink, unreachableLink } from './census-links'

type Crawl = { reachable?: boolean }

const row = (over: { type?: 'evo'; status?: 'pose-banned'; crawl?: Crawl } = {}): MnRow =>
  ({
    protx: 'a'.repeat(64),
    type: over.type ?? 'regular',
    status: over.status ?? 'enabled',
    crawl: { reachable: true, country: 'DE', asn: 24940, ...over.crawl },
  }) as unknown as MnRow

// A banned node, which the census's masternode figures do not count, sits in every group.
const rows: MnRow[] = [
  row({}),
  row({ type: 'evo' }),
  row({ crawl: { reachable: false } }),
  row({ type: 'evo', crawl: { reachable: false } }),
  row({ status: 'pose-banned' }),
  row({ status: 'pose-banned', crawl: { reachable: false } }),
]
const enabled = rows.filter((r) => r.status === 'enabled')
const evoEnabled = enabled.filter((r) => r.type === 'evo')

describe('census links open lists whose count equals the figure', () => {
  it.each<[string, ReturnType<typeof reachableLink>, readonly MnRow[]]>([
    ['reachable masternodes', reachableLink(), enabled.filter((r) => r.crawl?.reachable)],
    ['unreachable, masternodes', unreachableLink('mn'), enabled.filter((r) => !r.crawl?.reachable)],
    [
      'unreachable, evonodes',
      unreachableLink('evo'),
      evoEnabled.filter((r) => !r.crawl?.reachable),
    ],
    ['a hosting provider, masternodes', hostLink(['24940'], 'mn'), enabled],
    ['a hosting provider, evonodes', hostLink(['24940'], 'evo'), evoEnabled],
    ['a country, masternodes', countryLink('DE', 'mn'), enabled],
    ['a country, evonodes', countryLink('DE', 'evo'), evoEnabled],
  ])('%s', (_name, filter, expected) => {
    expect(filterMnRows(rows, filter)).toEqual(expected)
  })

  it.each<CensusScope>(['mn', 'evo'])('every %s link names the enabled status', (scope) => {
    for (const f of [unreachableLink(scope), hostLink(['1'], scope), countryLink('DE', scope)])
      expect(f.status).toEqual(['enabled'])
  })
})
