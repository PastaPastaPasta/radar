import { describe, expect, it } from 'vitest'
import {
  contractMeta,
  dpnsName,
  identityBalance,
  platformAddressInfo,
  tokenBalance,
} from '@/data/sdk/batchers'
import { sdk } from '@/data/sdk/client'

const MAINNET = {
  identity: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
  contract: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  absent: '11111111111111111111111111111111',
}

describe('SDK batchers over the recorded fixtures', () => {
  it('answers identity balances and contract metadata for the asked keys, null for the absent', async () => {
    const [a, b] = await Promise.all([
      identityBalance.fetch('mainnet', MAINNET.identity),
      identityBalance.fetch('mainnet', MAINNET.absent),
    ])
    expect(typeof a.data).toBe('bigint')
    expect(b.data).toBe(null)
    expect(a.proved).toBe(true)
    const [c, d] = await Promise.all([
      contractMeta.fetch('mainnet', MAINNET.contract),
      contractMeta.fetch('mainnet', MAINNET.absent),
    ])
    expect(c.data?.id).toBe(MAINNET.contract)
    expect(d.data).toBe(null)
  })

  it('names an identity from the DPNS index, the oldest name first', async () => {
    const name = await dpnsName.fetch('mainnet', MAINNET.identity)
    expect(name.data).toBe('pshenmic.dash')
  })

  it('finds a funded Platform address by the address asked, not by the SDK’s hex key', async () => {
    const [found, absent] = await Promise.all([
      platformAddressInfo.fetch('mainnet', 'dash1kpn8c0q9rpz09k8cy6pgzyqhln7yy00cdue3kgjx'),
      platformAddressInfo.fetch('mainnet', 'dash1kqg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zy22lqa3'),
    ])
    expect(found.data).toMatchObject({ balance: 8_816_520_200n })
    expect(absent.data).toBe(null)
  })

  it('reads a token balance that exists, one identity across tokens or one token across identities', async () => {
    const token = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'
    const holder = '3NQNyo6DAtXxdWjG4pKxyi51yis9k19UgbtYxZSmFrAh'
    const [hit, miss] = await Promise.all([
      tokenBalance.fetch('mainnet', { tokenId: token, identityId: holder }),
      tokenBalance.fetch('mainnet', { tokenId: token, identityId: MAINNET.absent }),
    ])
    expect(hit.data).toBe(142_125_000_000n)
    expect(miss.data).toBe(null)
  })

  it('resolves a registered name whose label has o, i or l in it', async () => {
    const r = await sdk.call('mainnet', 'dpns.getUsernameByName', { name: 'pshenmic.dash' })
    expect(r.data).toMatchObject({ username: 'pshenmic.dash', identityId: MAINNET.identity })
  })

  it('keys a proposer by its ProTxHash in hex, for the current epoch and for a finalized one', async () => {
    const current = await sdk.call('mainnet', 'epoch.evonodesProposedBlocksByRange', {
      epoch: 88,
      limit: 5,
    })
    const finalized = await sdk.call('mainnet', 'epoch.finalizedInfos', {
      startEpoch: 86,
      count: 1,
    })
    const keys = [...current.data.keys(), ...(finalized.data[0]?.blockProposers.keys() ?? [])]
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('carries the answering node’s status', async () => {
    const r = await sdk.call('testnet', 'system.status', {})
    expect(r.data).toMatchObject({
      chainId: 'dash-testnet-51',
      peers: expect.any(Number) as number,
      nodeProTxHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
      tenderdashProtocol: { block: expect.any(Number) as number },
    })
  })
})
