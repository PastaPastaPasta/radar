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
  outputs,
})

describe('coreTxType', () => {
  it('calls a transaction whose every output is OP_RETURN data, not a payment', () => {
    expect(coreTxType(tx([out('nulldata')]))).toBe('data')
    expect(coreTxType(tx([out('nulldata'), out('nulldata')]))).toBe('data')
  })

  it('keeps a payment that also carries data a payment', () => {
    expect(coreTxType(tx([out('nulldata'), out('p2pkh')]))).toBe('transfer')
    expect(coreTxType(tx([out('p2pkh')]))).toBe('transfer')
  })

  it('leaves special transactions and coinbases to their own type', () => {
    expect(coreTxType(tx([out('nulldata')], 'assetLockTx'))).toBe('asset-lock')
    expect(coreTxType({ ...tx([out('nulldata')]), isCoinbase: true })).toBe('coinbase')
  })
})
