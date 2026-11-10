import { describe, expect, it } from 'vitest'
import { networkName } from './network-name'

describe('networkName', () => {
  it('names each network for display', () => {
    expect(networkName('mainnet')).toBe('Mainnet')
    expect(networkName('testnet')).toBe('Testnet')
    expect(networkName('devnet-ruby')).toBe('Devnet ruby')
  })
})
