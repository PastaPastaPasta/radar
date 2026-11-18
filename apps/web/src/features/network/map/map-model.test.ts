import { describe, expect, it } from 'vitest'
import {
  baseCity,
  concentration,
  concentrationsOfNodes,
  concentrationsOfRows,
  isNarrowed,
  placeLabels,
  placeOfRow,
  placesOfGeo,
  placesOfRows,
  populationFilter,
  scopeChange,
  scopeOf,
  segments,
} from './map-model'
import { regionBox } from './regions'
import { row } from './test-rows'

const FRA = { city: 'Frankfurt am Main', lat: 50.11, lon: 8.68 }

describe('the map model', () => {
  it('reads the scope from the address and writes it back @RA-51', () => {
    expect(scopeOf({ layer: 'mn' })).toBe('mn')
    expect(scopeOf({ layer: 'mn', type: ['evo'] })).toBe('evo')
    expect(scopeOf({ layer: 'mn', type: ['regular', 'evo'] })).toBe('mn')
    expect(scopeOf({ layer: 'nodes', type: ['evo'] })).toBe('nodes')
    expect(scopeChange('evo')).toEqual({ layer: 'mn', type: ['evo'] })
    expect(scopeChange('nodes')).toEqual({ layer: 'nodes', type: undefined })
  })

  it('counts enabled masternodes unless the address asks for PoSe-banned ones @RA-51', () => {
    expect(populationFilter({})).toEqual({ status: ['enabled'] })
    expect(populationFilter({ status: ['pose-banned'] })).toEqual({ status: ['pose-banned'] })
    expect(isNarrowed({})).toBe(false)
    expect(isNarrowed({ type: ['evo'], status: ['enabled'] })).toBe(false)
    expect(isNarrowed({ country: ['DE'] })).toBe(true)
    expect(isNarrowed({ status: ['enabled', 'pose-banned'] })).toBe(true)
  })

  it('folds districts into their city and places it where most of its nodes are @RA-50', () => {
    expect(baseCity('Frankfurt am Main (Innenstadt I)')).toBe('Frankfurt am Main')
    expect(baseCity('Singapore (Pioneer)')).toBe('Singapore')
    expect(baseCity('Wołów')).toBe('Wołów')
    expect(baseCity(null)).toBeNull()
    const rows = [
      row('a'),
      row('b'),
      row('c', { type: 'evo' }, { reachable: false }),
      row('d', {}, { ...FRA, as_org: 'OVH SAS', asn: 16276 }),
      row('e', {}, { ...FRA, city: 'Frankfurt am Main (Innenstadt I)', lat: 50.12, lon: 8.69 }),
      row('f', {}, { ...FRA }),
      row('g', {}, { lat: null, lon: null }),
    ]
    const places = placesOfRows(rows)
    expect(places.map((p) => [p.city, p.n])).toEqual([
      ['Falkenstein', 3],
      ['Frankfurt am Main', 3],
    ])
    const fra = places[1]!
    expect([fra.lat, fra.lon]).toEqual([50.11, 8.68])
    expect(fra.providers).toEqual([
      { org: 'Hetzner Online GmbH', n: 2 },
      { org: 'OVH SAS', n: 1 },
    ])
    expect(places[0]).toMatchObject({ evo: 1, answering: 2 })
    expect(placeOfRow(places, rows[4]!)?.id).toBe(fra.id)
    expect(placeOfRow(places, rows[6]!)).toBeUndefined()
  })

  it('finds how few groups hold half, counting the unknown in the whole @RA-50', () => {
    const c = concentration(
      [
        { key: 'b', n: 30 },
        { key: 'a', n: 50 },
        { key: 'c', n: 20 },
        { key: 'z', n: 0 },
      ],
      0,
    )
    expect(c.ranked.map((g) => g.key)).toEqual(['a', 'b', 'c'])
    expect(c.toHalf).toBe(1)
    expect(
      concentration(
        [
          { key: 'a', n: 50 },
          { key: 'b', n: 30 },
        ],
        40,
      ).toHalf,
    ).toBe(2)
    // more than half unknown: no number of groups holds half
    expect(concentration([{ key: 'a', n: 10 }], 30).toHalf).toBeUndefined()
    expect(concentration([], 0)).toMatchObject({ total: 0, toHalf: undefined })
  })

  it('draws the five largest, then the rest, then the unknown @RA-50', () => {
    const c = concentration(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((key, i) => ({ key, n: 10 - i })),
      3,
    )
    expect(segments(c).map((s) => [s.kind, s.n])).toEqual([
      ['group', 10],
      ['group', 9],
      ['group', 8],
      ['group', 7],
      ['group', 6],
      ['rest', 9],
      ['unknown', 3],
    ])
  })

  it('shares cities, countries and providers among the same masternodes @RA-50', () => {
    const rows = [
      row('a'),
      row('b'),
      row('c', {}, { ...FRA, country: 'DE', as_org: 'OVH SAS', asn: 16276 }),
      row(
        'd',
        {},
        {
          city: 'Mesa',
          country: 'US',
          lat: 33.42,
          lon: -111.83,
          as_org: 'Amazon.com, Inc.',
          asn: 16509,
        },
      ),
      row('e', {}, { lat: null, lon: null, as_org: null, asn: null }),
    ]
    const c = concentrationsOfRows(rows, placesOfRows(rows))
    expect(c.city).toMatchObject({ total: 5, unknown: 1, toHalf: 2 })
    expect(c.country.ranked).toEqual([
      { key: 'DE', n: 3 },
      { key: 'US', n: 1 },
    ])
    expect(c.country).toMatchObject({ unknown: 1, toHalf: 1 })
    expect(c.provider.ranked[0]).toEqual({ key: 'Hetzner Online GmbH', n: 2, asns: ['24940'] })
    expect(c.provider).toMatchObject({ unknown: 1, toHalf: 2 })
  })

  it('reads every reachable node from the geo document and the summary @RA-50', () => {
    const places = placesOfGeo({
      points: [
        { lat: 1.35, lon: 103.82, city: 'Singapore', country: 'SG', nodes: 10, masternodes: 9 },
        {
          lat: 1.32,
          lon: 103.7,
          city: 'Singapore (Pioneer)',
          country: 'SG',
          nodes: 12,
          masternodes: 12,
        },
        { lat: 50.48, lon: 12.37, city: 'Falkenstein', country: 'DE', nodes: 20, masternodes: 20 },
        { lat: 0, lon: 0, city: null, country: null, nodes: 0, masternodes: 0 },
      ],
      unlocated: 8,
    })
    expect(places.map((p) => [p.city, p.n, p.lat])).toEqual([
      ['Singapore', 22, 1.32],
      ['Falkenstein', 20, 50.48],
    ])
    const summary = {
      dists: {
        all: {
          country: [
            ['SG', 22],
            ['DE', 20],
            ['Unknown', 8],
          ],
          asn: [
            ['AS24940 Hetzner Online GmbH', 20],
            ['AS213230 Hetzner Online GmbH', 2],
            ['AS45102 Alibaba', 20],
            ['Unknown', 8],
          ],
        },
      },
    } as never
    const c = concentrationsOfNodes(places, 8, summary)
    expect(c.city).toMatchObject({ total: 50, unknown: 8, toHalf: 2 })
    expect(c.country).toMatchObject({ total: 50, unknown: 8, toHalf: 2 })
    expect(c.provider.ranked[0]).toEqual({
      key: 'Hetzner Online GmbH',
      n: 22,
      asns: ['24940', '213230'],
    })
  })

  it('labels the largest places first and never lets two labels touch @RA-50', () => {
    const bounds = regionBox('world')
    const box = (id: string, x: number, y: number) => ({ id, x, y, r: 10, w: 80, h: 14 })
    const labels = placeLabels(
      [box('a', 500, 100), box('b', 503, 101), box('c', 504, 100), box('d', 990, 200)],
      bounds,
      8,
    )
    expect(labels.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd'])
    for (const a of labels)
      for (const b of labels)
        if (a !== b)
          expect(
            a.x < b.x + 80 && b.x < a.x + 80 && a.y < b.y + 14 && b.y < a.y + 14,
            `${a.id} and ${b.id} overlap`,
          ).toBe(false)
    // the one at the right edge goes to its left
    expect(labels.find((l) => l.id === 'd')!.x).toBeLessThan(990)
    expect(placeLabels([box('a', 500, 100), box('b', 503, 101)], bounds, 1)).toHaveLength(1)
  })
})
