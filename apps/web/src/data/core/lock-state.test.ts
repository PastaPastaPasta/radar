import { describe, expect, it } from 'vitest'
import { instantLockFields, instantLockKeepDepth, instantLockView } from './lock-state'
import type { DecodedTx } from './types'

const pending: Partial<DecodedTx> = {}
const mined: Partial<DecodedTx> = { height: 100 }
const chainLocked: Partial<DecodedTx> = { height: 100, isChainLocked: true }
const claimedChainLock: Partial<DecodedTx> = { height: 100, chainLockClaim: 'one-node' }

describe('InstantSend lock state @IN-05 @HY-07', () => {
  it('reads a pending transaction as its node flag says, with or without a lock', () => {
    expect(instantLockView({ ...pending, ...instantLockFields(false) })).toEqual({ state: 'none' })
    expect(instantLockView({ ...pending, ...instantLockFields(true) })).toEqual({
      state: 'claimed',
      source: 'dapi',
    })
  })

  it('reads a mined transaction that is not ChainLocked as its node flag says', () => {
    expect(instantLockView({ ...mined, ...instantLockFields(false) }).state).toBe('none')
    expect(instantLockView({ ...mined, ...instantLockFields(true) }).state).toBe('claimed')
  })

  it('reads a lock with no claim attached as corroborated', () => {
    expect(instantLockView({ ...pending, isInstantLocked: true })).toEqual({
      state: 'corroborated',
      source: 'dapi',
    })
  })
})

describe('once the block is ChainLocked, InstantSend says nothing @IN-05 @HY-07', () => {
  it.each([
    ['a node reports a lock', instantLockFields(true)],
    ['a node reports no lock', instantLockFields(false)],
    ['Hyphen reports a lock', instantLockFields(true, 'hyphen')],
    ['Hyphen reports no lock', instantLockFields(false, 'hyphen')],
    ['nothing is carried', {}],
  ])('is settled when %s', (_name, fields) => {
    expect(instantLockView({ ...chainLocked, ...fields })).toEqual({ state: 'settled' })
  })

  it('counts a ChainLock one node reports', () => {
    expect(instantLockView({ ...claimedChainLock, ...instantLockFields(true) })).toEqual({
      state: 'settled',
    })
  })

  it('does not settle a pending transaction, whatever lock fields it carries', () => {
    expect(instantLockView({ isChainLocked: true, ...instantLockFields(true) }).state).toBe(
      'claimed',
    )
  })
})

describe('Hyphen’s answer is silence, not "no lock" @IN-05 @HY-07', () => {
  it.each([
    ['pending', pending],
    ['mined', mined],
  ])('reads Hyphen’s false for a %s transaction as not known', (_name, base) => {
    expect(instantLockView({ ...base, ...instantLockFields(false, 'hyphen') })).toEqual({
      state: 'unknown',
    })
  })

  it('still reads a lock Hyphen reports as one source’s claim', () => {
    expect(instantLockView({ ...pending, ...instantLockFields(true, 'hyphen') })).toEqual({
      state: 'claimed',
      source: 'hyphen',
    })
  })

  it('keeps a DAPI node’s false as a real answer for a pending transaction', () => {
    expect(instantLockView({ ...pending, ...instantLockFields(false, 'dapi') }).state).toBe('none')
  })
})

describe('a network without ChainLocks @IN-05', () => {
  const deep = (confirmations: number, locked = false): Partial<DecodedTx> => ({
    height: 100,
    confirmations,
    instantLockKeepDepth: instantLockKeepDepth('devnet-x'),
    ...instantLockFields(locked),
  })

  it('keeps locks 24 blocks on mainnet and 6 elsewhere', () => {
    expect(instantLockKeepDepth('mainnet')).toBe(24)
    expect(instantLockKeepDepth('testnet')).toBe(6)
    expect(instantLockKeepDepth('devnet-x')).toBe(6)
  })

  it('reads a transaction above the keep depth as its node says', () => {
    expect(instantLockView(deep(5)).state).toBe('none')
    expect(instantLockView(deep(5, true)).state).toBe('claimed')
  })

  it('says nothing once the transaction is at the keep depth, where nodes prune locks', () => {
    expect(instantLockView(deep(6))).toEqual({ state: 'settled' })
    expect(instantLockView(deep(7, true))).toEqual({ state: 'settled' })
  })

  it('does not apply the depth when a ChainLock is known on the network', () => {
    const known: Partial<DecodedTx> = {
      height: 100,
      confirmations: 50,
      ...instantLockFields(false),
    }
    expect(instantLockView(known).state).toBe('none')
  })
})
