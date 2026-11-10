import { describe, expect, it } from 'vitest'
import { coreVersion, velocity, versionCounts } from './versions'

describe('network internals helpers', () => {
  it('reads the Core version out of a peer subversion', () => {
    expect(coreVersion('/Dash Core:23.1.8/')).toBe('23.1.8')
    expect(coreVersion('/Dash Core:22.0.0(dev)/')).toBe('22.0.0')
    expect(coreVersion('/Satoshi:0.14/')).toBe('Satoshi:0.14')
    expect(coreVersion(undefined)).toBe('unknown')
  })

  it('counts peers per version, most common first', () => {
    const counts = versionCounts([
      { subversion: '/Dash Core:23.1.8/' },
      { subversion: '/Dash Core:23.1.0/' },
      { subversion: '/Dash Core:23.1.8/' },
      { subversion: null },
    ])
    expect(counts).toEqual([
      { version: '23.1.8', count: 2 },
      { version: 'unknown', count: 1 },
      { version: '23.1.0', count: 1 },
    ])
  })

  it('works out transactions per block over a window', () => {
    expect(
      velocity([
        { height: 100, txCount: 1_000 },
        { height: 200, txCount: 1_500 },
      ]),
    ).toEqual({ perBlock: 5, blocks: 100 })
    expect(velocity([{ height: 1, txCount: 1 }])).toBeUndefined()
  })
})
