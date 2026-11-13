import { describe, expect, it } from 'vitest'
import { contractMeta, dpnsName, identityBalance } from '@/data/sdk/batchers'

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
})
