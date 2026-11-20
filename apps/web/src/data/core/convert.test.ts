import type * as Wasm from '@radar/core-decode'
import { describe, expect, it } from 'vitest'
import { coreTxType } from './convert'

const out = (scriptType: Wasm.ScriptType): Wasm.TxOutput => ({
  n: 0,
  value: 0,
  scriptPubKeyHex: scriptType === 'nulldata' ? '6a' : '76a914',
  scriptPubKeyAsm: '',
  scriptType,
  address: null,
})

const tx = (outputs: Wasm.TxOutput[], txTypeName: Wasm.TxTypeName = 'classic') => ({
  txTypeName,
  isCoinbase: false,
  inputs: [] as Wasm.TxInput[],
  outputs,
})

describe('coreTxType', () => {
  it('calls a transaction whose every output is OP_RETURN data, not a payment', () => {
    expect(coreTxType(tx([out('nulldata')]), 'mainnet')).toBe('data')
    expect(coreTxType(tx([out('nulldata'), out('nulldata')]), 'mainnet')).toBe('data')
  })

  it('keeps a payment that also carries data a payment', () => {
    expect(coreTxType(tx([out('nulldata'), out('p2pkh')]), 'mainnet')).toBe('transfer')
    expect(coreTxType(tx([out('p2pkh')]), 'mainnet')).toBe('transfer')
  })

  it('leaves special transactions and coinbases to their own type', () => {
    expect(coreTxType(tx([out('nulldata')], 'assetLockTx'), 'mainnet')).toBe('asset-lock')
    expect(coreTxType({ ...tx([out('nulldata')]), isCoinbase: true }, 'mainnet')).toBe('coinbase')
  })

  it('calls a classic transaction shaped like a CoinJoin mix CoinJoin', () => {
    const denom = (n: number): Wasm.TxOutput => ({
      ...out('p2pkh'),
      n,
      value: 1_000_010,
      scriptPubKeyHex: '76a91461cc94af9385c8b1923057372f063e6050fe585f88ac',
    })
    const mix = {
      ...tx([denom(0), denom(1), denom(2)]),
      inputs: Array(3).fill({}) as Wasm.TxInput[],
    }
    expect(coreTxType(mix, 'mainnet')).toBe('coinjoin')
    expect(coreTxType({ ...mix, inputs: mix.inputs.slice(1) }, 'mainnet')).toBe('transfer')
    expect(coreTxType({ ...mix, txTypeName: 'proUpServTx' }, 'mainnet')).toBe('pro-up-serv')
  })
})
