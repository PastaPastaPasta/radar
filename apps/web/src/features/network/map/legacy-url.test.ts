import { describe, expect, it } from 'vitest'
import { filterMnRows } from '@/data/masternodes/filter'
import { legacyFilter, legacyKey, topVersions } from './legacy-url'
import { row } from './test-rows'

const rows = [
  row('a', {}, { reachable: true, version: '24.0.0' }),
  row('b', {}, { reachable: false, version: '23.1.8', lat: null, lon: null }),
  row('c', { status: 'pose-banned' }, { reachable: null, version: null }),
  row('d', { type: 'evo' }, { reachable: true, version: '24.0.0', country: 'US' }),
  row('e', {}, { reachable: true, version: '22.0.0' }),
]

describe('links from the old map', () => {
  it('knows the category each row had under each old colouring @RA-52', () => {
    const keys = (mode: Parameters<typeof legacyKey>[0]) => rows.map(legacyKey(mode, rows))
    expect(keys('reach')).toEqual([
      'reachable',
      'unreachable',
      'unchecked',
      'reachable',
      'reachable',
    ])
    expect(keys('pose')).toEqual(['enabled', 'enabled', 'banned', 'enabled', 'enabled'])
    expect(keys('type')).toEqual(['regular', 'regular', 'regular', 'evo', 'regular'])
    expect(keys('version')).toEqual(['24.0.0', '23.1.8', 'unknown', '24.0.0', '22.0.0'])
  })

  it('kept the five most common versions apart @RA-52', () => {
    const many = ['1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0'].flatMap((v, i) =>
      Array.from({ length: 10 - i }, (_, n) => row(`${v}-${n}`, {}, { version: v })),
    )
    expect(topVersions(many)).toEqual(['1.0', '2.0', '3.0', '4.0', '5.0'])
    expect(legacyKey('version', many)(row('x', {}, { version: '6.0' }))).toBe('other')
  })

  it('turns hidden categories into the filter they meant @RA-52', () => {
    expect(legacyFilter(rows, { q: 'x' }, 'reach', ['unreachable', 'unchecked'])).toEqual({
      q: 'x',
      reach: 'reachable',
    })
    expect(legacyFilter(rows, {}, 'pose', ['enabled'])).toEqual({ status: ['pose-banned'] })
    expect(legacyFilter(rows, {}, 'type', ['regular'])).toEqual({ type: ['evo'] })
    const version = legacyFilter(rows, { country: ['DE'] }, 'version', [
      '23.1.8',
      '22.0.0',
      'unknown',
    ])
    expect(version).toEqual({ country: ['DE'], version: ['24.0.0'] })
    expect(filterMnRows(rows, version).map((r) => r.protx)).toEqual(['a'])
  })

  it('keeps the filter as it is when nothing was hidden, or nothing can say it @RA-52', () => {
    expect(legacyFilter(rows, { reach: 'unreachable' }, 'version', [])).toEqual({
      reach: 'unreachable',
    })
    expect(legacyFilter(rows, {}, 'reach', ['unchecked'])).toEqual({})
  })
})
