import { describe, expect, it } from 'vitest'
import type { MnRow } from '@/data/masternodes/rows'
import type { RadarMasternode } from '@/data/radar/schemas'
import {
  colorScheme,
  filterSearch,
  geoTotals,
  headline,
  listFilter,
  mapView,
  mnPoints,
  sortGroup,
  topVersions,
} from './map-model'

function row(
  protx: string,
  over: Partial<MnRow> = {},
  crawl: Partial<RadarMasternode> | null = {},
): MnRow {
  return {
    protx,
    type: 'regular',
    status: 'enabled',
    service: `${protx}.example:9999`,
    host: `${protx}.example`,
    registration: null,
    crawl:
      crawl === null
        ? null
        : ({
            reachable: true,
            version: '24.0.0',
            country: 'DE',
            lat: 50,
            lon: 8,
            asn: 24940,
            as_org: 'Hetzner',
            dkg_readiness: { overall: 'pass', checks: {} },
            ...crawl,
          } as RadarMasternode),
    dapi: null,
    radar: null,
    ...over,
  }
}

const rows: MnRow[] = [
  row('a', {}, { reachable: true, version: '24.0.0' }),
  row('b', {}, { reachable: false, version: '23.1.8', lat: null, lon: null }),
  row('c', { status: 'pose-banned' }, { reachable: null, version: null }),
  row('d', { type: 'evo' }, { reachable: true, version: '24.0.0', country: 'US' }),
  row('e', {}, { reachable: true, version: '22.0.0' }),
]

describe('the map model', () => {
  it('keys each row by reachability, PoSe, type or version @RA-50', () => {
    const keys = (mode: Parameters<typeof colorScheme>[0]) =>
      rows.map((r) => colorScheme(mode, rows).keyOf(r))
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

  it('keeps the five most common versions and folds the rest into Other @RA-50', () => {
    const many = ['1.0', '2.0', '3.0', '4.0', '5.0', '6.0', '7.0'].flatMap((v, i) =>
      Array.from({ length: 10 - i }, (_, n) => row(`${v}-${n}`, {}, { version: v })),
    )
    expect(topVersions(many)).toEqual(['1.0', '2.0', '3.0', '4.0', '5.0'])
    const scheme = colorScheme('version', many)
    expect(scheme.order).toEqual(['1.0', '2.0', '3.0', '4.0', '5.0', 'other', 'unknown'])
    expect(scheme.keyOf(row('x', {}, { version: '6.0' }))).toBe('other')
    expect(scheme.toneOf('other')).toBe('other')
    expect(new Set(scheme.order.slice(0, 5).map(scheme.toneOf)).size).toBe(5)
  })

  it('counts categories among filtered rows and hides chips from what is drawn @RA-51', () => {
    const scheme = colorScheme('reach', rows)
    const view = mapView(rows, { country: ['DE'] }, scheme, new Set(['unreachable']))
    expect(view.filtered.map((r) => r.protx)).toEqual(['a', 'b', 'c', 'e'])
    expect(Object.fromEntries(view.counts)).toEqual({ reachable: 2, unreachable: 1, unchecked: 1 })
    expect(view.visible.map((r) => r.protx)).toEqual(['a', 'c', 'e'])
  })

  it('draws only masternodes that have a position, in their colour @RA-50', () => {
    const scheme = colorScheme('reach', rows)
    const points = mnPoints(rows, scheme)
    expect(points.map((p) => p.protx)).toEqual(['a', 'c', 'd', 'e'])
    expect(points.find((p) => p.protx === 'c')?.tone).toBe('axis')
    expect(points.find((p) => p.protx === 'd')?.evo).toBe(true)
  })

  it('splits the headline by PoSe and counts the masternodes off the map @RA-51', () => {
    expect(headline(rows)).toEqual({
      total: 5,
      answered: 3,
      enabled: { total: 4, answered: 3 },
      banned: { total: 1, answered: 0 },
      missing: 1,
    })
  })

  it('turns one remaining reachability or PoSe chip into a list filter @RA-51', () => {
    const reach = colorScheme('reach', rows)
    expect(listFilter({ q: 'x' }, reach, new Set(['unreachable', 'unchecked']))).toEqual({
      q: 'x',
      reach: 'reachable',
    })
    expect(listFilter({}, reach, new Set(['unchecked']))).toEqual({})
    const pose = colorScheme('pose', rows)
    expect(listFilter({}, pose, new Set(['enabled']))).toEqual({ status: ['pose-banned'] })
    expect(listFilter({ reach: 'unreachable' }, colorScheme('version', rows), new Set())).toEqual({
      reach: 'unreachable',
    })
  })

  it('leaves unset filter fields out of a link @RA-51', () => {
    expect(filterSearch({ q: undefined, type: ['evo'], host: ['24940'] })).toEqual({
      type: ['evo'],
      host: ['24940'],
    })
  })

  it('sums the all-nodes layer @RA-50', () => {
    expect(
      geoTotals({
        points: [
          { lat: 1, lon: 2, city: 'A', country: 'DE', nodes: 10, masternodes: 4 },
          { lat: 3, lon: 4, city: null, country: null, nodes: 5, masternodes: 5 },
        ],
        unlocated: 7,
      }),
    ).toEqual({ nodes: 15, masternodes: 9, places: 2, unlocated: 7 })
  })

  it('lists answering masternodes first @RA-50', () => {
    expect(sortGroup(rows).map((r) => r.protx)).toEqual(['a', 'd', 'e', 'b', 'c'])
  })
})
