import { describe, expect, it } from 'vitest'
import { isDevnet, networkSearch, parseNetworkParam, type NetworkId } from './network'

describe('parseNetworkParam', () => {
  it('treats an absent param as mainnet without a redirect', () => {
    expect(parseNetworkParam()).toEqual({ net: 'mainnet', redirect: false })
  })

  it.each(['mainnet', 'testnet', 'devnet-bluebird', 'devnet-a1', 'devnet-x'])(
    'accepts %s as given',
    (value) => {
      expect(parseNetworkParam(value)).toEqual({ net: value, redirect: false })
    },
  )

  it.each(['', 'Testnet', 'regtest', 'devnet', 'devnet-', 'devnet-Blue', 'devnet--a', 'devnet-a-'])(
    'falls back to mainnet and redirects for the bad value %j',
    (value) => {
      expect(parseNetworkParam(value)).toEqual({ net: 'mainnet', redirect: true })
    },
  )

  it('rejects a devnet name longer than 63 characters', () => {
    expect(parseNetworkParam(`devnet-${'a'.repeat(64)}`).redirect).toBe(true)
    expect(parseNetworkParam(`devnet-${'a'.repeat(63)}`).redirect).toBe(false)
  })

  it('reads the legacy net param and redirects to the canonical URL', () => {
    expect(parseNetworkParam(undefined, 'testnet')).toEqual({ net: 'testnet', redirect: true })
    expect(parseNetworkParam(undefined, 'devnet-x')).toEqual({ net: 'devnet-x', redirect: true })
    expect(parseNetworkParam(undefined, 'bogus')).toEqual({ net: 'mainnet', redirect: true })
  })

  it('prefers network over the legacy param and still redirects to drop it', () => {
    expect(parseNetworkParam('testnet', 'mainnet')).toEqual({ net: 'testnet', redirect: true })
  })
})

describe('networkSearch', () => {
  it('omits the param on mainnet', () => {
    expect(networkSearch('mainnet')).toEqual({})
  })

  it('sets the param on other networks', () => {
    expect(networkSearch('testnet')).toEqual({ network: 'testnet' })
    expect(networkSearch('devnet-x')).toEqual({ network: 'devnet-x' })
  })

  it('round-trips through parseNetworkParam', () => {
    for (const net of ['mainnet', 'testnet', 'devnet-bluebird'] as NetworkId[]) {
      expect(parseNetworkParam(networkSearch(net).network).net).toBe(net)
    }
  })
})

describe('isDevnet', () => {
  it('is true only for devnet ids', () => {
    expect(isDevnet('devnet-x')).toBe(true)
    expect(isDevnet('mainnet')).toBe(false)
    expect(isDevnet('testnet')).toBe(false)
  })
})
