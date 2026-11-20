import { describe, expect, it } from 'vitest'
import { coreTxType as fromDecoder } from '@/data/core/convert'
import { fixtureBody } from '@/test/fixtures/load'
import { coreTxType as fromHyphen } from './tx-type'

const DATA_ONLY = '05ae6f4ccbb3faa242da965f1dc33ee73f63527ef9c9c896184dc2c22829b1cc'

interface Out {
  scriptPubKey: { hex: string }
}

/** What DAPI's decoder says of the same outputs. */
const decoded = (vout: readonly Out[]) =>
  fromDecoder(
    {
      txTypeName: 'classic',
      isCoinbase: false,
      inputs: [],
      outputs: vout.map((o, n) => ({
        n,
        value: 0,
        scriptPubKeyHex: o.scriptPubKey.hex,
        scriptPubKeyAsm: '',
        scriptType: o.scriptPubKey.hex.startsWith('6a')
          ? ('nulldata' as const)
          : ('p2pkh' as const),
        address: null,
      })),
    },
    'mainnet',
  )

describe('Hyphen’s data type and Radar’s', () => {
  it('agree on a transaction whose only output is OP_RETURN', async () => {
    const tx = await fixtureBody<{ txType: string; outputCount: number; vout: Out[] }>(
      'hyphen',
      'mainnet',
      `tx__${DATA_ONLY}`,
    )
    expect(tx.txType).toBe('data')
    expect(decoded(tx.vout)).toBe('data')
    expect(fromHyphen(tx.txType, tx.outputCount)).toBe('data')
  })

  it('never call a payment that carries data “Data”, as Hyphen’s word alone would', () => {
    const vout = [{ scriptPubKey: { hex: '6a0401020304' } }, { scriptPubKey: { hex: '76a914' } }]
    expect(decoded(vout)).toBe('transfer')
    expect(fromHyphen('data', vout.length)).toBeUndefined()
    expect(fromHyphen('data')).toBeUndefined()
  })

  it('maps Hyphen’s other names as before', () => {
    expect(fromHyphen('normal')).toBe('transfer')
    expect(fromHyphen('asset_lock')).toBe('asset-lock')
  })
})
