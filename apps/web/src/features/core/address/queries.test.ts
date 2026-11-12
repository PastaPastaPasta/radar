import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { insQueries } from '@/data/insight/queries'
import { insKeys } from '@/data/query/keys'
import { knownOutputValue, UTXO_AUTO_REFRESH_MAX, utxosWorthRefreshing } from './queries'

const A = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'
const TXID = 'ab'.repeat(32)
const stamp = { source: 'insight' as const, asOf: 0, fetchedAt: 0, proved: false }

describe('the Insight UTXO read', () => {
  it('is never refetched on window focus, so a large address is read once per block at most @IN-06', () => {
    expect(insQueries.addressUtxos('testnet', A).refetchOnWindowFocus).toBe(false)
    expect(insQueries.address('testnet', A).refetchOnWindowFocus).toBe(true)
  })

  it('is refreshed by a new block only while the list is of a size worth fetching again @IN-06', () => {
    const list = (n: number) => ({ state: { data: { ...stamp, data: new Array<unknown>(n) } } })
    expect(utxosWorthRefreshing(list(UTXO_AUTO_REFRESH_MAX))).toBe(true)
    expect(utxosWorthRefreshing(list(UTXO_AUTO_REFRESH_MAX + 1))).toBe(false)
    expect(utxosWorthRefreshing({ state: { data: undefined } })).toBe(true)
  })
})

describe('knownOutputValue', () => {
  it('reads the UTXO set of the index the page reads, never the other one @IN-06', () => {
    const client = new QueryClient()
    client.setQueryData(insKeys('testnet', 'address-utxos', { address: A }), {
      ...stamp,
      data: [{ address: A, txid: TXID, vout: 1, scriptPubKey: '76', satoshis: 700n }],
    })
    expect(knownOutputValue(client, 'testnet', A, 'insight', `${TXID}:1`)).toBe(700n)
    expect(knownOutputValue(client, 'testnet', A, 'insight', `${TXID}:0`)).toBeUndefined()
    expect(knownOutputValue(client, 'testnet', A, 'hyphen', `${TXID}:1`)).toBeUndefined()
  })
})
