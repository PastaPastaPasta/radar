import { afterEach, describe, expect, it } from 'vitest'
import type { MnRow } from '@/data/masternodes/rows'
import { activateLocale } from '@/i18n'
import { masternodesClaim } from './claim'

afterEach(() => activateLocale('en'))

const row = (over: Partial<MnRow> = {}): MnRow => ({
  protx: 'a',
  type: 'regular',
  status: 'enabled',
  service: null,
  host: null,
  registration: null,
  crawl: null,
  dapi: null,
  radar: null,
  ...over,
})
const crawled = (reachable: boolean) => ({ reachable }) as unknown as NonNullable<MnRow['crawl']>
const many = (n: number, over: Partial<MnRow> = {}) =>
  Array.from({ length: n }, (_, i) => row({ protx: String(i), ...over }))

describe('the masternodes headline', () => {
  it('says how many enabled masternodes answered, in the singular for one @IN-09', () => {
    expect(masternodesClaim(many(1, { crawl: crawled(true) })).text).toBe(
      '1 of 1 enabled masternode answered the last crawl',
    )
    const rows = [...many(2, { crawl: crawled(true) }), ...many(1, { crawl: crawled(false) })]
    expect(masternodesClaim(rows)).toEqual({
      kind: 'answering',
      text: '2 of 3 enabled masternodes answered the last crawl',
    })
  })

  it('says how many registered masternodes are enabled where the crawl does not cover them @IN-09', () => {
    expect(masternodesClaim(many(1)).text).toBe('1 of 1 masternode is enabled')
    const rows = [...many(2), row({ status: 'pose-banned' })]
    expect(masternodesClaim(rows)).toEqual({
      kind: 'enabled',
      text: '2 of 3 masternodes are enabled',
    })
  })

  it('takes the plural form each language needs @IN-13', async () => {
    await activateLocale('ru')
    expect(masternodesClaim(many(1, { crawl: crawled(true) })).text).toBe(
      '1 из 1 включённой мастерноды ответили при последнем обходе',
    )
    expect(masternodesClaim(many(5, { crawl: crawled(true) })).text).toBe(
      '5 из 5 включённых мастернод ответили при последнем обходе',
    )
    expect(masternodesClaim(many(2)).text).toBe('2 из 2 мастернод включены')
    await activateLocale('uk')
    expect(masternodesClaim(many(21)).text).toBe('21 з 21 мастерноди увімкнені')
    await activateLocale('fr')
    expect(masternodesClaim(many(1)).text).toBe('1 sur 1 masternode est activé')
  })
})
