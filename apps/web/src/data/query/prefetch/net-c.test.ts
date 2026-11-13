import { describe, expect, it } from 'vitest'
import { mnPrefetch } from './net-c'

const PROTX = 'ab'.repeat(32)

describe('mnPrefetch', () => {
  it('reads the Radar masternode record and waits for it, then asks DAPI for its list', () => {
    const items = mnPrefetch('testnet', { protx: PROTX }, { network: 'testnet' })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ cost: 'http', wait: true })
    expect(items[1]).toMatchObject({ cost: 'dapi', detail: true })
    expect(items.filter((i) => i.cost === 'dapi')).toHaveLength(1)
  })

  it('adds the speed test for the network tab and the older payments page for a payments cursor', () => {
    const network = mnPrefetch('mainnet', { protx: PROTX }, { tab: 'network' })
    expect(network.map((i) => i.cost)).toEqual(['http', 'dapi', 'http'])
    const payments = mnPrefetch('mainnet', { protx: PROTX }, { tab: 'payments', before: 2568000 })
    expect(payments).toHaveLength(3)
    expect(mnPrefetch('mainnet', { protx: PROTX }, { tab: 'payments' })).toHaveLength(2)
  })

  it('reads Platform only through the ready gate, for the platform tab', () => {
    const items = mnPrefetch('mainnet', { protx: PROTX }, { tab: 'platform', epoch: 80 })
    expect(items.map((i) => i.cost)).toEqual(['http', 'dapi', 'sdk'])
  })

  it('reads nothing for a devnet or an id that is not a ProTx hash', () => {
    expect(mnPrefetch('devnet-paloma', { protx: PROTX }, {})).toEqual([])
    expect(mnPrefetch('mainnet', { protx: 'abc' }, {})).toEqual([])
  })
})
