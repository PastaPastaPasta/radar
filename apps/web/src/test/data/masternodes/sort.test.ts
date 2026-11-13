import { describe, expect, it } from 'vitest'
import type { MnRow } from '@/data/masternodes/rows'
import {
  isMnSortKey,
  MN_SORT_KEYS,
  parseMnSort,
  parseSort,
  sortItems,
  sortMnRows,
  statusRank,
} from '@/data/masternodes/sort'
import type { RadarMasternode } from '@/data/radar/schemas'

const hex = (n: number) => n.toString(16).padStart(64, '0')

function row(
  n: number,
  over: Partial<MnRow> = {},
  crawl: Partial<RadarMasternode> | null = null,
): MnRow {
  return {
    protx: hex(n),
    type: 'regular',
    status: 'enabled',
    service: `10.0.0.${n}:9999`,
    host: `10.0.0.${n}`,
    registration: null,
    crawl: crawl ? ({ protx: hex(n), ...crawl } as RadarMasternode) : null,
    dapi: null,
    radar: null,
    ...over,
  }
}

describe('statusRank', () => {
  it('puts banned first, then silent, then unknown, then answering', () => {
    expect(statusRank(row(1, { status: 'pose-banned' }, { reachable: true }))).toBe(0)
    expect(statusRank(row(2, {}, { reachable: false }))).toBe(1)
    expect(statusRank(row(3))).toBe(2)
    expect(statusRank(row(4, {}, { reachable: true }))).toBe(3)
  })
})

describe('parseSort', () => {
  it('reads a leading minus as descending and falls back on a column the table lacks', () => {
    expect(parseMnSort('-uptime_30d')).toEqual({ key: 'uptime_30d', desc: true })
    expect(parseMnSort('version')).toEqual({ key: 'version', desc: false })
    expect(parseMnSort('-nonsense')).toEqual({ key: 'status', desc: true })
    expect(parseSort('x', (k): k is 'a' => k === 'a', { key: 'a', desc: false })).toEqual({
      key: 'a',
      desc: false,
    })
  })

  it('names a sort key for every column', () => {
    expect(MN_SORT_KEYS.every(isMnSortKey)).toBe(true)
    expect(isMnSortKey('nope')).toBe(false)
  })
})

describe('sortItems', () => {
  const read = (n: number | null) => n
  const id = (n: number | null) => String(n)

  it('orders numbers and breaks ties by id', () => {
    expect(sortItems([3, 1, 2], false, read, id)).toEqual([1, 2, 3])
    expect(sortItems([3, 1, 2], true, read, id)).toEqual([3, 2, 1])
  })

  it('keeps an item with no value last in either direction', () => {
    expect(sortItems([2, null, 1], false, read, id)).toEqual([1, 2, null])
    expect(sortItems([2, null, 1], true, read, id)).toEqual([2, 1, null])
  })

  it('compares text with numbers inside it in numeric order', () => {
    const out = sortItems(
      ['24.10.0', '24.2.0', '24.9.1'],
      false,
      (s) => s,
      (s) => s,
    )
    expect(out).toEqual(['24.2.0', '24.9.1', '24.10.0'])
  })
})

describe('sortMnRows', () => {
  const rows = [
    row(1, {}, { version: '23.1.8', uptime_30d: 90, reachable: true }),
    row(2, {}, { version: '24.0.0', uptime_30d: 99.5, reachable: false }),
    row(3),
    row(4, { status: 'pose-banned' }, { version: '24.0.0', uptime_30d: 10, reachable: true }),
  ]
  const ids = (sorted: MnRow[]) => sorted.map((r) => Number(`0x${r.protx}`))

  it('puts the answering first by default', () => {
    expect(ids(sortMnRows(rows, '-status'))).toEqual([1, 3, 2, 4])
  })

  it('sorts by a crawl column and leaves the uncrawled row last', () => {
    expect(ids(sortMnRows(rows, '-uptime_30d'))).toEqual([2, 1, 4, 3])
    expect(ids(sortMnRows(rows, 'version'))).toEqual([1, 2, 4, 3])
  })

  it('does not change the rows it is given', () => {
    const before = rows.map((r) => r.protx)
    sortMnRows(rows, 'protx')
    expect(rows.map((r) => r.protx)).toEqual(before)
  })
})
