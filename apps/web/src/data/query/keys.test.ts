import { describe, expect, it } from 'vitest'
import { dapiKeys, hyKeys, netKey, peKeys, queryKey, radarKeys, sdkKeys, viewKeys } from './keys'

describe('query keys', () => {
  it('put net first, then source, resource, params', () => {
    expect(radarKeys('mainnet', 'summary')).toEqual(['mainnet', 'radar', 'summary'])
    expect(peKeys('testnet', 'blocks', { page: 2 })).toEqual([
      'testnet',
      'pe',
      'blocks',
      { page: 2 },
    ])
    expect(hyKeys('mainnet', 'tx', { txid: 'ab' })).toEqual([
      'mainnet',
      'hyphen',
      'tx',
      { txid: 'ab' },
    ])
    expect(dapiKeys('mainnet', 'tip')).toEqual(['mainnet', 'dapi', 'tip'])
    expect(viewKeys('mainnet', 'mn-rows')).toEqual(['mainnet', 'view', 'mn-rows'])
  })

  it('drops undefined params and omits an empty params object', () => {
    expect(radarKeys('mainnet', 'history', { dim: 'ua', top: undefined })).toEqual([
      'mainnet',
      'radar',
      'history',
      { dim: 'ua' },
    ])
    expect(radarKeys('mainnet', 'history', { top: undefined })).toEqual([
      'mainnet',
      'radar',
      'history',
    ])
  })

  it('sorts param keys so insertion order never changes the key', () => {
    const a = queryKey('mainnet', 'pe', 'x', { b: 1, a: 2 })
    const b = queryKey('mainnet', 'pe', 'x', { a: 2, b: 1 })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('netKey is the prefix of every key of that network', () => {
    const prefix = netKey('testnet')
    expect(prefix).toEqual(['testnet'])
    expect(radarKeys('testnet', 'summary').slice(0, 1)).toEqual(prefix)
  })

  it('sdkKeys folds structured args into stable params', () => {
    const ids = ['b', 'a']
    const k1 = sdkKeys('mainnet', 'identities.fetch', { id: 'X' })
    expect(k1).toEqual(['mainnet', 'sdk', 'identities.fetch', { id: 'X' }])
    const k2 = sdkKeys('mainnet', 'identities.balances', { ids })
    expect(k2).toEqual(['mainnet', 'sdk', 'identities.balances', { ids: '["b","a"]' }])
    expect(sdkKeys('mainnet', 'system.status', {})).toEqual(['mainnet', 'sdk', 'system.status'])
  })
})
