import { describe, expect, it } from 'vitest'
import { instantLockFields, instantLockKeepDepth, instantLockView } from './lock-state'
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
        unknownBy: 'pruned',
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

describe('Hyphen’s answer is silence, not "no lock" @IN-05 @HY-07', () => {
  it.each([
    ['pending', pending],
    ['mined', mined],
    ['ChainLocked', chainLocked],
  ])('reads Hyphen’s false for a %s transaction as not known', (_name, base) => {
    expect(instantLockView({ ...base, ...instantLockFields(false, 'hyphen') })).toMatchObject({
      state: 'unknown',
      sources: [],
      unknownBy: 'source',
    })
  })

  it('still reads a lock Hyphen reports as one source’s claim', () => {
    expect(instantLockView({ ...pending, ...instantLockFields(true, 'hyphen') })).toMatchObject({
      state: 'claimed',
      sources: ['hyphen'],
    })
  })

  it('keeps a DAPI node’s false as a real answer for a pending transaction', () => {
    expect(instantLockView({ ...pending, ...instantLockFields(false, 'dapi') }).state).toBe('none')
  })
})

describe('a lock remembered from an earlier visit @IN-05 @DATA-02', () => {
  const remembered = { ...instantLockFields(false), instantLockRemembered: true as const }

  it('is ignored for a pending transaction', () => {
    expect(instantLockView({ ...pending, ...remembered }).state).toBe('none')
  })

  it('is ignored for a mined transaction that is not historical', () => {
    expect(instantLockView({ ...mined, ...remembered }).state).toBe('none')
  })

  it('applies to a transaction in a ChainLocked block, as a DAPI node’s claim', () => {
    expect(instantLockView({ ...chainLocked, ...remembered })).toMatchObject({
      state: 'claimed',
      sources: ['dapi'],
      historical: true,
    })
  })
})

describe('a network without ChainLocks @IN-05', () => {
  const deep = (confirmations: number): Partial<DecodedTx> => ({
    height: 100,
    confirmations,
    instantLockKeepDepth: instantLockKeepDepth('devnet-x'),
    ...instantLockFields(false),
  })

  it('keeps locks 24 blocks on mainnet and 6 elsewhere', () => {
    expect(instantLockKeepDepth('mainnet')).toBe(24)
    expect(instantLockKeepDepth('testnet')).toBe(6)
    expect(instantLockKeepDepth('devnet-x')).toBe(6)
  })

  it('reads a transaction above the keep depth as its node says', () => {
    expect(instantLockView(deep(5))).toMatchObject({ state: 'none', historical: false })
  })

  it('treats a transaction at the keep depth as historical, and its silence as unknown', () => {
    expect(instantLockView(deep(6))).toMatchObject({
      state: 'unknown',
      historical: true,
      unknownBy: 'pruned',
    })
  })

  it('applies a remembered lock once it is that deep', () => {
    const view = instantLockView({ ...deep(7), instantLockRemembered: true })
    expect(view).toMatchObject({ state: 'claimed', sources: ['dapi'] })
    expect(instantLockView({ ...deep(2), instantLockRemembered: true }).state).toBe('none')
  })

  it('does not apply the depth when a ChainLock is known on the network', () => {
    const known: Partial<DecodedTx> = {
      height: 100,
      confirmations: 50,
      ...instantLockFields(false),
    }
    expect(instantLockView(known)).toMatchObject({ state: 'none', historical: false })
  })
})
