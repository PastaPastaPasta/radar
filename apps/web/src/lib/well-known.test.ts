import { describe, expect, it, vi } from 'vitest'
import { isPlatformId } from './base58'
import {
  labelsVersion,
  notifyLabelsChanged,
  registerLabelOverlay,
  subscribeLabels,
  systemContract,
  wellKnownContracts,
  wellKnownIdentities,
  wellKnownLabel,
  wellKnownTokens,
} from './well-known'

describe('the well-known table', () => {
  it('holds valid, distinct ids on every network', () => {
    for (const net of ['mainnet', 'testnet', 'devnet-paloma'] as const) {
      const ids = [
        ...wellKnownContracts(net).map((c) => c.id),
        ...wellKnownTokens(net).flatMap((t) => [t.id, t.contractId]),
        ...wellKnownIdentities(net).map((i) => i.id),
      ]
      for (const id of ids) expect(isPlatformId(id), id).toBe(true)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('names the system contracts, which are the same on every network', () => {
    expect(wellKnownContracts('mainnet')).toHaveLength(8)
    expect(wellKnownContracts('devnet-paloma')).toEqual(wellKnownContracts('mainnet'))
    expect(systemContract('dpns').id).toBe('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec')
    expect(systemContract('withdrawals').id).toBe('4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6')
    expect(() => systemContract('nope')).toThrow()
  })

  it('lists tokens per network, none on a devnet', () => {
    expect(wellKnownTokens('mainnet').map((t) => t.symbol)).toEqual(['SANS', 'DUSD'])
    expect(wellKnownTokens('testnet')).toHaveLength(1)
    expect(wellKnownTokens('devnet-paloma')).toEqual([])
  })

  it('labels a contract by name, a token by symbol and the system identity', () => {
    expect(wellKnownLabel('mainnet', 'contract', systemContract('dashpay').id)).toBe('DashPay')
    expect(wellKnownLabel('mainnet', 'token', 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB')).toBe(
      'SANS',
    )
    expect(wellKnownLabel('testnet', 'token', 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB')).toBe(
      undefined,
    )
    expect(wellKnownLabel('mainnet', 'identity', '11111111111111111111111111111111')).toBe(
      'Platform system',
    )
    expect(wellKnownLabel('mainnet', 'document', systemContract('dpns').id)).toBeUndefined()
  })
})

describe('label overlays', () => {
  it('win over the table, can be removed, and tell subscribers', () => {
    const id = systemContract('dpns').id
    const seen = vi.fn()
    const unsubscribe = subscribeLabels(seen)
    const before = labelsVersion()
    const remove = registerLabelOverlay((_net, kind, key) =>
      kind === 'contract' && key === id ? 'My names' : undefined,
    )
    expect(wellKnownLabel('mainnet', 'contract', id)).toBe('My names')
    expect(wellKnownLabel('mainnet', 'contract', systemContract('dashpay').id)).toBe('DashPay')
    expect(labelsVersion()).toBeGreaterThan(before)
    remove()
    expect(wellKnownLabel('mainnet', 'contract', id)).toBe('DPNS')
    const calls = seen.mock.calls.length
    notifyLabelsChanged()
    expect(seen.mock.calls.length).toBe(calls + 1)
    unsubscribe()
  })
})
