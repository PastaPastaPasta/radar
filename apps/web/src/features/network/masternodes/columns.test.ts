import { describe, expect, it } from 'vitest'
import type { MnRow } from '@/data/masternodes/rows'
import { blocksAgo, listTip } from './columns'

describe('blocksAgo', () => {
  it('says how long ago a number of Core blocks was, in the largest unit that reads well @RA-20', () => {
    expect(blocksAgo(0, 'en')).toBe('1 min. ago')
    expect(blocksAgo(12, 'en')).toBe('30 min. ago')
    expect(blocksAgo(244, 'en')).toBe('10 hr. ago')
    expect(blocksAgo(1271, 'en')).toBe('2 days ago')
    expect(blocksAgo(129_400, 'en')).toBe('7 mo. ago')
    expect(blocksAgo(1_620_000, 'en')).toBe('7.7 yr. ago')
  })

  it('speaks the reader’s language', () => {
    expect(blocksAgo(1271, 'de')).toBe('vor 2 Tagen')
  })
})

describe('listTip', () => {
  const row = (last_paid_height: number | null): MnRow =>
    ({ crawl: last_paid_height === null ? null : { last_paid_height } }) as MnRow

  it('is the newest height any masternode was paid at, and 0 with no crawl', () => {
    expect(listTip([row(10), row(2_572_105), row(null), row(7)])).toBe(2_572_105)
    expect(listTip([row(null)])).toBe(0)
  })
})
