import { describe, expect, it } from 'vitest'
import type { RadarHistory } from '@/data/radar/schemas'
import {
  byNewest,
  byOrg,
  isCoreVersion,
  isTiny,
  keepVersions,
  kindOf,
  ladderGroups,
  majorOf,
  onMajor,
  radarScope,
  releaseBook,
  versionOf,
} from './census-math'

const book = releaseBook({
  releases: [
    { tag: 'v24.0.0', version: '24.0.0', prerelease: false, published: 3 },
    { tag: 'v24.0.0-rc.7', version: '24.0.0', prerelease: true, published: 2 },
    { tag: 'v24.1.0-rc.1', version: '24.1.0', prerelease: true, published: 4 },
    { tag: 'v23.1.10', version: '23.1.10', prerelease: false, published: 1 },
    { tag: 'v23.1.8', version: '23.1.8', prerelease: false, published: 1 },
    { tag: 'v23.1.7', version: '23.1.7', prerelease: false, published: 1 },
  ],
})

describe('versions', () => {
  it('orders newest first by numeric part', () => {
    expect(['23.1.9', '24.0.0', '23.1.10'].sort(byNewest)).toEqual(['24.0.0', '23.1.10', '23.1.9'])
  })

  it('tells Dash Core from other clients and reads the version out of a user agent', () => {
    expect(isCoreVersion('24.0.0')).toBe(true)
    expect(isCoreVersion('Lksc Core 5.18')).toBe(false)
    expect(versionOf('/Dash Core:24.0.0/')).toBe('24.0.0')
    expect(versionOf('/Dash Core:23.1.0(foo)/')).toBe('23.1.0')
  })

  it('calls a version with a final release a release even after candidates, and an unknown one a build', () => {
    expect(book.status('24.0.0')).toBe('release')
    expect(book.status('24.1.0')).toBe('candidate')
    expect(book.status('99.0.0')).toBe('build')
    expect(book.finals).toEqual(['24.0.0', '23.1.10', '23.1.8', '23.1.7'])
    expect(kindOf(book, 'Foo 1.0')).toBe(3)
  })

  it('reads every version as a release without the release list', () => {
    expect(releaseBook(undefined).status('99.0.0')).toBe('release')
  })
})

describe('ladderGroups', () => {
  const rows = [
    ['24.0.0', 800],
    ['23.1.10', 100],
    ['23.1.8', 4],
    ['23.1.7', 3],
    ['24.1.0', 10],
    ['25.0.0-dev', 5],
    ['Foo 1.0', 15],
    ['Bar 2.0', 10],
  ] as const
  const sum = rows.reduce((a, r) => a + r[1], 0)

  it('groups releases, candidates, builds and other clients, folding releases under 1 % and other clients', () => {
    const groups = ladderGroups(book, rows.slice(), sum)
    expect(groups.map((g) => g.kind)).toEqual([0, 1, 2, 3])
    const releases = groups[0]!.rows
    expect(releases.map((r) => r.key)).toEqual(['24.0.0', '23.1.10', '23.1.8'])
    expect(releases[2]).toMatchObject({ folded: 2, n: 7 })
    expect(groups[3]!.rows).toEqual([{ key: 'Foo 1.0', n: 25, folded: 2 }])
  })

  it('folds the latest major’s small releases apart from older majors’', () => {
    const two = releaseBook({
      releases: [
        { tag: 'v24.0.1', version: '24.0.1', prerelease: false, published: 5 },
        { tag: 'v24.0.0', version: '24.0.0', prerelease: false, published: 3 },
        { tag: 'v23.1.9', version: '23.1.9', prerelease: false, published: 2 },
        { tag: 'v23.1.8', version: '23.1.8', prerelease: false, published: 1 },
      ],
    })
    const rows = [
      ['24.0.1', 900],
      ['24.0.0', 5],
      ['23.1.9', 3],
      ['23.1.8', 2],
    ] as const
    const releases = ladderGroups(two, rows.slice(), 910)[0]!.rows
    expect(releases).toEqual([
      { key: '24.0.1', n: 900 },
      { key: '24.0.0', n: 5 },
      { key: '23.1.9', n: 5, folded: 2 },
    ])
  })

  it('keeps a major’s releases together, the small ones after its larger ones', () => {
    const two = releaseBook({
      releases: [
        { tag: 'v24.0.2', version: '24.0.2', prerelease: false, published: 5 },
        { tag: 'v24.0.1', version: '24.0.1', prerelease: false, published: 4 },
        { tag: 'v23.1.9', version: '23.1.9', prerelease: false, published: 3 },
      ],
    })
    const rows = [
      ['24.0.2', 500],
      ['23.1.9', 400],
      ['24.0.1', 5],
    ] as const
    expect(ladderGroups(two, rows.slice(), 905)[0]!.rows.map((r) => r.key)).toEqual([
      '24.0.2',
      '24.0.1',
      '23.1.9',
    ])
  })

  it('puts the fold of older majors last, after every shown release', () => {
    const many = releaseBook({
      releases: [
        { tag: 'v24.0.2', version: '24.0.2', prerelease: false, published: 5 },
        { tag: 'v23.1.2', version: '23.1.2', prerelease: false, published: 4 },
        { tag: 'v23.0.3', version: '23.0.3', prerelease: false, published: 3 },
        { tag: 'v22.0.0', version: '22.0.0', prerelease: false, published: 2 },
        { tag: 'v21.1.0', version: '21.1.0', prerelease: false, published: 1 },
      ],
    })
    const rows = [
      ['24.0.2', 500],
      ['23.1.2', 400],
      ['23.0.3', 80],
      ['22.0.0', 4],
      ['21.1.0', 3],
    ] as const
    expect(ladderGroups(many, rows.slice(), 987)[0]!.rows).toEqual([
      { key: '24.0.2', n: 500 },
      { key: '23.1.2', n: 400 },
      { key: '23.0.3', n: 80 },
      { key: '22.0.0', n: 7, folded: 2 },
    ])
  })

  it('keeps the latest release first even when nothing runs it', () => {
    const groups = ladderGroups(book, [['23.1.10', 100]], 100)
    expect(groups[0]!.rows[0]).toEqual({ key: '24.0.0', n: 0 })
  })
})

describe('byOrg', () => {
  it('groups a provider that runs several ASNs and keeps the digits for the host filter', () => {
    const rows = byOrg([
      ['AS16509 Amazon.com, Inc.', 10],
      ['AS14618 Amazon.com, Inc.', 5],
      ['AS24940 Hetzner Online GmbH', 30],
      ['Unknown', 2],
    ])
    expect(rows.map((r) => [r.org, r.n, r.asns])).toEqual([
      ['Hetzner Online GmbH', 30, ['24940']],
      ['Amazon.com, Inc.', 15, ['16509', '14618']],
      ['Unknown', 2, []],
    ])
  })
})

describe('keepVersions', () => {
  const doc: RadarHistory = {
    t: [1, 2],
    resolution: 'day',
    series: [
      { key: '23.1.9', values: [5, 6] },
      { key: '23.1.8', values: [3, 2] },
      { key: '24.0.0', values: [1, 4] },
      { key: 'Other', values: [1, 1] },
    ],
  }

  it('keeps the latest release among the named series and folds the rest into Other', () => {
    const out = keepVersions(doc, 2, '24.0.0')
    expect(out.series.map((s) => s.key)).toEqual(['23.1.9', '24.0.0', 'Other'])
    expect(out.series.find((s) => s.key === 'Other')!.values).toEqual([4, 3])
  })

  it('leaves a short list alone', () => {
    expect(keepVersions(doc, 6, '24.0.0')).toBe(doc)
  })
})

describe('shares', () => {
  it('maps the route scope to Radar’s', () => {
    expect(radarScope('other')).toBe('nonmn')
    expect(radarScope('evo')).toBe('evo')
  })

  it('shows a handful of nodes in a large set as under 0.1 %', () => {
    expect(isTiny(1, 10_000)).toBe(true)
    expect(isTiny(0, 10_000)).toBe(false)
    expect(isTiny(100, 10_000)).toBe(false)
  })
})

describe('major releases', () => {
  it('reads the major of a Core version and nothing else', () => {
    expect(majorOf('24.0.3')).toBe('24')
    expect(majorOf('23.1.10')).toBe('23')
    expect(majorOf('Lksc Core 5.18')).toBeUndefined()
    expect(majorOf('Unknown')).toBeUndefined()
  })

  it('counts every build of a major, not a longer major that starts the same', () => {
    const rows: [string, number][] = [
      ['24.0.3', 10],
      ['24.1.0', 2],
      ['23.1.8', 5],
      ['240.0.0', 7],
      ['Unknown', 3],
    ]
    expect(onMajor(rows, '24')).toBe(12)
    expect(onMajor(rows, '23')).toBe(5)
  })
})
