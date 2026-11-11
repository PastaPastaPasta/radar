import { describe, expect, it } from 'vitest'
import { classify } from '../classify'
import { planResolvers } from '../useSearch'
import { radarMasternodeByAddress, serviceHost } from './radar-masternode'

const ctx = (net: 'mainnet' | 'testnet' | 'devnet-x' = 'mainnet') => ({
  net,
  signal: new AbortController().signal,
})

const REGULAR = '219edddca6b0973d4b9fd24ae62d9b8a8c4addd0d1c44de577e1ef127f37fb32'

describe('masternode by service address @HY-14', () => {
  it('is planned for an address and for an address with a port', () => {
    for (const input of ['85.209.241.228', '85.209.241.228:9999']) {
      const c = classify(input, 'mainnet')
      expect(planResolvers(c, 'mainnet', 'palette').map((r) => r.id)).toContain(
        'radar-masternode-address',
      )
    }
  })

  it('opens the masternode page for the node at that address', async () => {
    const hits = await radarMasternodeByAddress.resolve(
      classify('85.209.241.228', 'mainnet'),
      ctx(),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      kind: 'masternode',
      id: REGULAR,
      href: { to: '/mn/$protx', params: { protx: REGULAR } },
      stamp: { source: 'radar' },
    })
  })

  it('matches only the typed port when there is one', async () => {
    const right = await radarMasternodeByAddress.resolve(
      classify('85.209.241.228:9999', 'mainnet'),
      ctx(),
    )
    expect(right).toHaveLength(1)
    const wrong = await radarMasternodeByAddress.resolve(
      classify('85.209.241.228:1234', 'mainnet'),
      ctx(),
    )
    expect(wrong).toEqual([])
  })

  it('offers nothing for an address no masternode uses, rather than a list page', async () => {
    expect(
      await radarMasternodeByAddress.resolve(classify('203.0.113.9', 'mainnet'), ctx()),
    ).toEqual([])
  })

  it('finds testnet masternodes on testnet', async () => {
    const hits = await radarMasternodeByAddress.resolve(
      classify('68.67.122.24', 'testnet'),
      ctx('testnet'),
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]?.href).toMatchObject({ to: '/mn/$protx' })
  })

  it('does not ask Radar about a devnet', async () => {
    expect(
      await radarMasternodeByAddress.resolve(
        classify('85.209.241.228', 'mainnet'),
        ctx('devnet-x'),
      ),
    ).toEqual([])
  })
})

describe('serviceHost', () => {
  it('splits host and port for IPv4 and bracketed IPv6', () => {
    expect(serviceHost('1.2.3.4:9999')).toEqual({ host: '1.2.3.4', port: '9999' })
    expect(serviceHost('1.2.3.4')).toEqual({ host: '1.2.3.4', port: null })
    expect(serviceHost('[2001:db8::1]:9999')).toEqual({ host: '[2001:db8::1]', port: '9999' })
    expect(serviceHost('2001:db8::1')).toEqual({ host: '2001:db8::1', port: null })
  })
})
