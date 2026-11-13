import { describe, expect, it } from 'vitest'
import { mnPrefetch } from './net-c'

const PROTX = 'ab'.repeat(32)

describe('mnPrefetch', () => {
  it('reads the Radar masternode record and waits for it', () => {
    const items = mnPrefetch('testnet', { protx: PROTX }, { network: 'testnet' })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ cost: 'http', wait: true })
  })

  it('reads nothing for a devnet or an id that is not a ProTx hash', () => {
    expect(mnPrefetch('devnet-paloma', { protx: PROTX }, {})).toEqual([])
    expect(mnPrefetch('mainnet', { protx: 'abc' }, {})).toEqual([])
  })
})
