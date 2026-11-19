import { describe, expect, it } from 'vitest'
import { legacyHidden, legacyKey, legacyListFilter, topVersions } from './legacy-url'
import { row } from './test-rows'

const rows = [
  row('a', {}, { reachable: true, version: '24.0.0' }),
  row('b', {}, { reachable: false, version: '23.1.8', lat: null, lon: null }),
  row('c', { status: 'pose-banned' }, { reachable: null, version: null }),
  row('d', { type: 'evo' }, { reachable: true, version: '24.0.0', country: 'US' }),
  row('e', {}, { reachable: true, version: '22.0.0' }),
]

const kept = (mode: Parameters<typeof legacyHidden>[0], hide: string[], list = rows) => {
  const hidden = legacyHidden(mode, list, hide)
  return list.filter((r) => !hidden?.(r)).map((r) => r.protx)
}

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

  it('leaves out exactly what the link hid @RA-52', () => {
    expect(kept('reach', ['unreachable', 'unchecked'])).toEqual(['a', 'd', 'e'])
    expect(kept('pose', ['enabled'])).toEqual(['c'])
    expect(kept('type', ['regular'])).toEqual(['d'])
    expect(legacyHidden('reach', rows, [])).toBeUndefined()
  })

  it('stays empty when the link hid every row @RA-52', () => {
    const regular = rows.filter((r) => r.type === 'regular')
    expect(kept('type', ['regular'], regular)).toEqual([])
  })

  it('keeps unknown versions unless the link hid them @RA-52', () => {
    expect(kept('version', ['23.1.8'])).toEqual(['a', 'c', 'd', 'e'])
    expect(kept('version', ['23.1.8', 'unknown'])).toEqual(['a', 'd', 'e'])
  })

  it('says an exclusion in the list’s filters only when they mean exactly the same rows @RA-52', () => {
    expect(legacyListFilter('pose', rows, ['enabled'])).toEqual({ status: ['pose-banned'] })
    expect(legacyListFilter('pose', rows, ['banned'])).toEqual({ status: ['enabled'] })
    expect(legacyListFilter('type', rows, ['regular'])).toEqual({ type: ['evo'] })
    expect(legacyListFilter('reach', rows, ['unreachable', 'unchecked'])).toEqual({
      reach: 'reachable',
    })
    expect(legacyListFilter('version', rows, ['23.1.8', 'unknown'])).toEqual({
      version: ['22.0.0', '24.0.0'],
    })
    expect(legacyListFilter('pose', rows, [])).toEqual({})
    expect(legacyListFilter('pose', rows, ['nothing-of-the-sort'])).toEqual({})
    // a kept row with no value, two reachability states, or nothing left: the list can't say it
    expect(legacyListFilter('version', rows, ['23.1.8'])).toBeUndefined()
    expect(legacyListFilter('reach', rows, ['unchecked'])).toBeUndefined()
    expect(legacyListFilter('reach', rows, ['reachable'])).toBeUndefined()
    expect(legacyListFilter('pose', rows, ['enabled', 'banned'])).toBeUndefined()
  })
})
