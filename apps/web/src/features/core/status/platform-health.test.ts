import { describe, expect, it } from 'vitest'
import { EXPECTED_BLOCK_MS, platformHealth, type PlatformHealthInput } from './platform-health'

const NOW = 1_800_000_000_000
const base: PlatformHealthInput = {
  lastBlockMs: NOW - 30_000,
  catchingUp: false,
  peers: 40,
  coreChainLockedHeight: 1000,
  coreTip: 1001,
  now: NOW,
}

describe('platformHealth @NX-54', () => {
  it('is live with no reasons when blocks arrive and Platform follows the ChainLock', () => {
    expect(platformHealth(base)).toEqual({ state: 'live', reasons: [] })
  })

  it('is lagging after two expected intervals and stalled after five, with the age as the reason', () => {
    const lagging = platformHealth({ ...base, lastBlockMs: NOW - EXPECTED_BLOCK_MS * 3 })
    expect(lagging.state).toBe('lagging')
    expect(lagging.reasons).toEqual([{ kind: 'no-block', ageMs: EXPECTED_BLOCK_MS * 3 }])
    expect(platformHealth({ ...base, lastBlockMs: NOW - EXPECTED_BLOCK_MS * 6 }).state).toBe(
      'stalled',
    )
  })

  it('is lagging while the node catches up or has no peers', () => {
    expect(platformHealth({ ...base, catchingUp: true })).toMatchObject({
      state: 'lagging',
      reasons: [{ kind: 'catching-up' }],
    })
    expect(platformHealth({ ...base, peers: 0 }).reasons).toEqual([{ kind: 'no-peers' }])
  })

  it('compares the ChainLocked Core height with Core’s tip, and says nothing without a tip', () => {
    expect(platformHealth({ ...base, coreTip: 1010 })).toMatchObject({
      state: 'lagging',
      reasons: [{ kind: 'core-behind', blocks: 10 }],
    })
    expect(platformHealth({ ...base, coreTip: 1100 }).state).toBe('stalled')
    expect(platformHealth({ ...base, coreTip: undefined }).state).toBe('live')
  })

  it('keeps the worst state and every reason', () => {
    const v = platformHealth({ ...base, lastBlockMs: NOW - EXPECTED_BLOCK_MS * 3, coreTip: 1100 })
    expect(v.state).toBe('stalled')
    expect(v.reasons.map((r) => r.kind)).toEqual(['no-block', 'core-behind'])
  })
})
