import { describe, expect, it } from 'vitest'
import { instantLockFields, instantLockView } from './lock-state'
import type { DecodedTx } from './types'

const pending: Partial<DecodedTx> = {}
const mined: Partial<DecodedTx> = { height: 100 }
const chainLocked: Partial<DecodedTx> = { height: 100, isChainLocked: true }
const claimedChainLock: Partial<DecodedTx> = { height: 100, chainLockClaim: 'one-node' }

describe('InstantSend lock state @IN-05 @HY-07', () => {
  it('reads a pending transaction as its node flag says, with or without a lock', () => {
    expect(instantLockView({ ...pending, ...instantLockFields(false) })).toMatchObject({
      state: 'none',
      sources: [],
    })
    expect(instantLockView({ ...pending, ...instantLockFields(true) })).toMatchObject({
      state: 'claimed',
      sources: ['dapi'],
      historical: false,
    })
  })

  it('reads a mined transaction that is not ChainLocked as its node flag says', () => {
    expect(instantLockView({ ...mined, ...instantLockFields(false) }).state).toBe('none')
    expect(instantLockView({ ...mined, ...instantLockFields(true) }).state).toBe('claimed')
  })

  it('ignores Hyphen’s record until the block is ChainLocked', () => {
    expect(instantLockView({ ...mined, ...instantLockFields(false) }, true).state).toBe('none')
    expect(instantLockView({ ...pending, ...instantLockFields(false) }, true).state).toBe('none')
  })

  it('keeps a lock a DAPI node reports for a ChainLocked block', () => {
    expect(instantLockView({ ...chainLocked, ...instantLockFields(true) })).toMatchObject({
      state: 'claimed',
      sources: ['dapi'],
      historical: true,
    })
  })

  it('shows Hyphen’s record when the DAPI node has dropped its lock', () => {
    expect(instantLockView({ ...chainLocked, ...instantLockFields(false) }, true)).toMatchObject({
      state: 'claimed',
      sources: ['hyphen'],
      historical: true,
    })
  })

  it('names both sources when both report a lock', () => {
    expect(instantLockView({ ...chainLocked, ...instantLockFields(true) }, true).sources).toEqual([
      'dapi',
      'hyphen',
    ])
  })

  it('says the state is not known, never "no lock", when a ChainLocked block has no report', () => {
    for (const hyphenLock of [undefined, false]) {
      expect(instantLockView({ ...chainLocked, ...instantLockFields(false) }, hyphenLock)).toEqual({
        state: 'unknown',
        sources: [],
        historical: true,
      })
    }
  })

  it('treats a ChainLock one node reports as already past the point where nodes drop locks', () => {
    expect(instantLockView({ ...claimedChainLock, ...instantLockFields(false) }).state).toBe(
      'unknown',
    )
  })

  it('names Hyphen as the source when Hyphen stood in for DAPI', () => {
    expect(instantLockView({ ...chainLocked, ...instantLockFields(true, 'hyphen') })).toMatchObject(
      { state: 'claimed', sources: ['hyphen'] },
    )
  })
})
