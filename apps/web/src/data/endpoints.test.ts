import { describe, expect, it } from 'vitest'
import { dapiDefaultPort, endpoint } from './endpoints'

describe('endpoint', () => {
  it('mainnet and testnet resolve every source', () => {
    expect(endpoint('mainnet', 'radar')).toBe('https://radar.dashhq.org/api/v1/mainnet')
    expect(endpoint('testnet', 'radar')).toBe('https://radar.dashhq.org/api/v1/testnet')
    expect(endpoint('mainnet', 'pe')).toBe('https://api.pe.dashhq.org')
    expect(endpoint('testnet', 'pe')).toBe('https://api.testnet.pe.dashhq.org')
    expect(endpoint('mainnet', 'hyphen')).toBe('/x/hy/mainnet')
    expect(endpoint('testnet', 'hyphen')).toBe('/x/hy/testnet')
    expect(endpoint('mainnet', 'quorums')).toBe('https://quorums.mainnet.networks.dash.org')
    expect(endpoint('testnet', 'quorums')).toBe('https://quorums.testnet.networks.dash.org')
  })

  it('rate is PE mainnet only', () => {
    expect(endpoint('mainnet', 'rate')).toBe('https://api.pe.dashhq.org')
    expect(endpoint('testnet', 'rate')).toBeNull()
  })

  it('a devnet uses its configured quorum URL and falls back to the default', () => {
    const devnets = [
      { name: 'ruby', dapiAddresses: [], quorumUrl: ' https://q.example.test ' },
      { name: 'jade', dapiAddresses: [] },
    ]
    expect(endpoint('devnet-ruby', 'quorums', devnets)).toBe('https://q.example.test')
    expect(endpoint('devnet-jade', 'quorums', devnets)).toBe(
      'https://quorums.jade.networks.dash.org',
    )
    expect(endpoint('devnet-onyx', 'quorums', devnets)).toBe(
      'https://quorums.onyx.networks.dash.org',
    )
    expect(endpoint('testnet', 'quorums', devnets)).toBe(
      'https://quorums.testnet.networks.dash.org',
    )
  })

  it('devnets have only a quorum list', () => {
    expect(endpoint('devnet-ruby', 'quorums')).toBe('https://quorums.ruby.networks.dash.org')
    for (const s of ['radar', 'pe', 'hyphen', 'rate'] as const) {
      expect(endpoint('devnet-ruby', s)).toBeNull()
    }
  })
})

describe('dapiDefaultPort', () => {
  it('is 443 on mainnet, 1443 on testnet and unset on devnets', () => {
    expect(dapiDefaultPort('mainnet')).toBe(443)
    expect(dapiDefaultPort('testnet')).toBe(1443)
    expect(dapiDefaultPort('devnet-ruby')).toBeNull()
  })
})
