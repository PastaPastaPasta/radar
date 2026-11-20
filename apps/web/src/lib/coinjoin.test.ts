import { describe, expect, it } from 'vitest'
import { isCoinJoinMix, isDenominatedAmount, looksLikeCoinJoinMix } from './coinjoin'

/** Mixing transactions from mainnet blocks 2,574,433–2,574,438, as Insight gives their outputs (script, duffs). */
const MAINNET_MIXES: { txid: string; inputs: number; outputs: [string, bigint][] }[] = [
  {
    txid: '00e1eaf1cabfd721b23e765682f909e5ad378ccfa601441ad96d5bbed7b7ec12',
    inputs: 5,
    outputs: [
      ['76a91461cc94af9385c8b1923057372f063e6050fe585f88ac', 1000010n],
      ['76a9147cb08c01330d383e7e7055ddd226191c34343ad988ac', 1000010n],
      ['76a914a103176585025c7ecb829751aee94e7b9c7c02cc88ac', 1000010n],
      ['76a914a2c997f1e048c8d1c116305d2aa9fc6c413ddd7c88ac', 1000010n],
      ['76a914ed04f062e3f4d35168c499eabb939303e670814a88ac', 1000010n],
    ],
  },
  {
    txid: 'a0005da77dc5843e8b10cc4f6a9f8e08e888548f51597068aab53ef92372df0d',
    inputs: 6,
    outputs: [
      ['76a9141316ea5ddc4cf19768530c7c801cc344301e699388ac', 100001n],
      ['76a9142bd61aaa70ac54bc720bf0cdbfb1381c1346a6c988ac', 100001n],
      ['76a9144153659b3b7aac3701a6fd6a746a887a3f52388b88ac', 100001n],
      ['76a9147a1b10e0e45cfbe2e9358a9fc8ecb03baf9d977a88ac', 100001n],
      ['76a914d11451f4cb74cc3e946a8c3765b8a7b5e4ab6cf588ac', 100001n],
      ['76a914df0ed9e0be403e0140b72236c4fad8862e5bb49a88ac', 100001n],
    ],
  },
  {
    txid: 'ec9aaad16ad7a39e9911bb19d1363c9b05a812fb78fe4432ef3faf53784f120d',
    inputs: 4,
    outputs: [
      ['76a9146e3ea8f57946f7976e7fc63a21deee3231ae72ee88ac', 100001000n],
      ['76a914aa940213d4242090662b943f813de09e41e9963c88ac', 100001000n],
      ['76a914b038d87da0ad7412f03b2a1724fddaa69a9e681788ac', 100001000n],
      ['76a914c89af799f5c8ff039d45246eb99c59242e07f9cd88ac', 100001000n],
    ],
  },
  {
    txid: 'c94739cf3bf367e2d3a26fa032bef3cc682eeb988957bee15011b991796d1d48',
    inputs: 7,
    outputs: [
      ['76a91444851d3b492332d1fc090a8e11e022e30e89957088ac', 10000100n],
      ['76a9145bdd02217fb965d99e2eff7e024a675a0c0166e188ac', 10000100n],
      ['76a9148750eac8802dfbd76bfcfa45c7633386e6cbf11e88ac', 10000100n],
      ['76a914940c4bc41edeac95a7d58e7aa73bf8a8b959538988ac', 10000100n],
      ['76a914b7e8a15e096f2ff05d1039a9f911acb2c5ad623688ac', 10000100n],
      ['76a914cfb94c5e5a28ff4ed228f14ec496f9ec1c5924db88ac', 10000100n],
      ['76a914fcdc89e13d448afb7217474e5514a61d0faee20c88ac', 10000100n],
    ],
  },
]

const asTx = (m: (typeof MAINNET_MIXES)[number]) => ({
  inputs: m.inputs,
  outputs: m.outputs.map(([scriptPubKey, value]) => ({ scriptPubKey, value })),
})

const P2PKH = '76a91461cc94af9385c8b1923057372f063e6050fe585f88ac'
const P2SH = 'a914d1ed4bd52d03f4f4ba5d8d1c4ab51b8e2e9d6fdb87'

describe('isDenominatedAmount', () => {
  it('knows the five standard denominations and nothing near them', () => {
    for (const d of [1_000_010_000n, 100_001_000n, 10_000_100n, 1_000_010n, 100_001n])
      expect(isDenominatedAmount(d)).toBe(true)
    for (const d of [1_000_000_000n, 100_000_000n, 100_001_001n, 100_000n, 10_000n, 0n])
      expect(isDenominatedAmount(d)).toBe(false)
  })
})

describe('isCoinJoinMix', () => {
  it.each(MAINNET_MIXES.map((m) => [m.txid.slice(0, 8), m] as const))(
    'calls mainnet mix %s CoinJoin',
    (_, m) => {
      expect(isCoinJoinMix(asTx(m), 'mainnet')).toBe(true)
    },
  )

  it('needs as many inputs as outputs', () => {
    const m = asTx(MAINNET_MIXES[0]!)
    expect(isCoinJoinMix({ ...m, inputs: m.inputs - 1 }, 'mainnet')).toBe(false)
    expect(isCoinJoinMix({ ...m, inputs: m.inputs + 1 }, 'mainnet')).toBe(false)
  })

  it('needs every output a P2PKH paying a standard denomination', () => {
    const m = asTx(MAINNET_MIXES[0]!)
    const [first, ...rest] = m.outputs
    expect(
      isCoinJoinMix({ ...m, outputs: [{ ...first!, value: 1_000_000n }, ...rest] }, 'mainnet'),
    ).toBe(false)
    expect(
      isCoinJoinMix({ ...m, outputs: [{ ...first!, scriptPubKey: P2SH }, ...rest] }, 'mainnet'),
    ).toBe(false)
  })

  it('needs the pool minimum: three on mainnet, two on testnet', () => {
    const two = {
      inputs: 2,
      outputs: [1, 2].map(() => ({ scriptPubKey: P2PKH, value: 1_000_010n })),
    }
    expect(isCoinJoinMix(two, 'mainnet')).toBe(false)
    expect(isCoinJoinMix(two, 'testnet')).toBe(true)
  })

  it('stops at 180 inputs, the most a pool of 20 can bring', () => {
    const of = (n: number) => ({
      inputs: n,
      outputs: Array.from({ length: n }, () => ({ scriptPubKey: P2PKH, value: 100_001n })),
    })
    expect(isCoinJoinMix(of(180), 'mainnet')).toBe(true)
    expect(isCoinJoinMix(of(181), 'mainnet')).toBe(false)
  })
})

describe('looksLikeCoinJoinMix', () => {
  it('reads a block-list row by its counts and total (00e1eaf1, 5 × 0.0100001 DASH)', () => {
    const row = { txType: 'normal', valueOut: 5_000_050n, inputCount: 5, outputCount: 5 }
    expect(looksLikeCoinJoinMix(row, 'mainnet')).toBe(true)
    expect(looksLikeCoinJoinMix({ ...row, outputCount: 4 }, 'mainnet')).toBe(false)
    expect(looksLikeCoinJoinMix({ ...row, valueOut: 5_000_049n }, 'mainnet')).toBe(false)
    expect(looksLikeCoinJoinMix({ ...row, txType: 'coinbase' }, 'mainnet')).toBe(false)
  })

  it('reads an address-list row by its total and a fee of zero', () => {
    const row = { txType: 'normal', valueOut: 5_000_050n, fee: 0n }
    expect(looksLikeCoinJoinMix(row, 'mainnet')).toBe(true)
    expect(looksLikeCoinJoinMix({ ...row, fee: 226n }, 'mainnet')).toBe(false)
    expect(looksLikeCoinJoinMix({ ...row, fee: null }, 'mainnet')).toBe(false)
    expect(looksLikeCoinJoinMix({ ...row, valueOut: 200_002n }, 'mainnet')).toBe(false)
  })

  it('tries every denomination: ten 0.100001 DASH coins are one 1.00001, too few alone', () => {
    const row = { txType: 'normal', valueOut: 10n * 10_000_100n, fee: 0n }
    expect(looksLikeCoinJoinMix(row, 'mainnet')).toBe(true)
    expect(looksLikeCoinJoinMix({ ...row, valueOut: 0n }, 'mainnet')).toBe(false)
  })

  it('leaves a row with neither counts nor a fee alone', () => {
    expect(looksLikeCoinJoinMix({ txType: 'normal', valueOut: 5_000_050n }, 'mainnet')).toBe(false)
  })
})
