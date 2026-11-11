import { describe, expect, it } from 'vitest'
import { linkOutUrl } from './linkouts'

const ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

describe('linkOutUrl', () => {
  it('leaves the network off Governance links on mainnet and adds it elsewhere', () => {
    expect(linkOutUrl({ app: 'gov', action: 'proposal', hash: 'ab12', net: 'mainnet' })).toBe(
      'https://gov.dashhq.org/p/h/ab12',
    )
    expect(linkOutUrl({ app: 'gov', action: 'proposal', hash: 'ab12', net: 'testnet' })).toBe(
      'https://gov.dashhq.org/p/h/ab12?network=testnet',
    )
    expect(linkOutUrl({ app: 'gov', action: 'masternodes', net: 'devnet-ruby' })).toBe(
      'https://gov.dashhq.org/masternodes?network=devnet-ruby',
    )
  })

  it('opens the contested name in Governance and escapes the label', () => {
    expect(linkOutUrl({ app: 'gov', action: 'contest-vote', label: 'a b/c', net: 'mainnet' })).toBe(
      'https://gov.dashhq.org/names/a%20b%2Fc',
    )
  })

  it.each([
    ['identity', 'https://bridge.dashhq.org/?mode=topup&identity=' + ID + '&network=mainnet'],
    ['name', 'https://bridge.dashhq.org/?mode=dpns&identity=' + ID + '&network=mainnet'],
    ['platform-address', 'https://bridge.dashhq.org/?address=' + ID + '&network=mainnet'],
    ['contract', 'https://bridge.dashhq.org/?mode=contract&network=mainnet'],
    ['token', 'https://bridge.dashhq.org/?network=mainnet'],
  ] as const)('prefills Bridge for %s', (action, url) => {
    expect(linkOutUrl({ app: 'bridge', action, id: ID, net: 'mainnet' })).toBe(url)
  })

  it('always tells Bridge the network, because it defaults to testnet', () => {
    expect(linkOutUrl({ app: 'bridge', action: 'identity', id: ID, net: 'testnet' })).toContain(
      'network=testnet',
    )
  })

  it('points the explorers at the network’s own site', () => {
    expect(linkOutUrl({ app: 'pe', path: '/identity/x', net: 'testnet' })).toBe(
      'https://testnet.pe.dashhq.org/identity/x',
    )
    expect(linkOutUrl({ app: 'hyphen', path: 'address/x', net: 'mainnet' })).toBe(
      'https://hy.kw.vg/address/x',
    )
    expect(linkOutUrl({ app: 'insight', path: '/tx/x', net: 'mainnet' })).toBe(
      'https://insight.dash.org/insight/tx/x',
    )
  })

  it('has no explorer link on a devnet', () => {
    for (const app of ['pe', 'hyphen', 'insight'] as const) {
      expect(linkOutUrl({ app, path: '/x', net: 'devnet-ruby' })).toBeNull()
    }
  })
})
