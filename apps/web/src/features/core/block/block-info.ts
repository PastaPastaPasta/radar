import type { DecodedBlock, DecodedTx } from '@/data/core/types'

/**
 * Difficulty from the compact target, the way Dash Core prints it: the target a difficulty-1 block
 * would have (0x00ffff at shift 29) divided by this block's target.
 */
export function difficultyFromBits(bitsHex: string): number {
  const bits = parseInt(bitsHex, 16)
  let shift = bits >>> 24
  const mantissa = bits & 0x00ffffff
  if (mantissa === 0) return 0
  let diff = 0x0000ffff / mantissa
  while (shift < 29) {
    diff *= 256
    shift++
  }
  while (shift > 29) {
    diff /= 256
    shift--
  }
  return diff
}

/** Mining pools by the tag they put in the coinbase script. First match wins. */
const POOL_TAGS: readonly (readonly [RegExp, string])[] = [
  [/f2pool|🐟|七彩神仙鱼/i, 'F2Pool'],
  [/poolin/i, 'Poolin'],
  [/luxor/i, 'Luxor'],
  [/antpool/i, 'AntPool'],
  [/viabtc/i, 'ViaBTC'],
  [/btc\.com|btccom/i, 'BTC.com'],
  [/binance/i, 'Binance Pool'],
  [/sbicrypto|sbi crypto/i, 'SBI Crypto'],
  [/trustpool/i, 'Trustpool'],
  [/2miners/i, '2Miners'],
  [/prohashing/i, 'ProHashing'],
  [/miningpoolhub/i, 'Mining Pool Hub'],
  [/zpool/i, 'Zpool'],
  [/suprnova/i, 'Suprnova'],
  [/coinmine/i, 'Coinmine'],
  [/p2pool/i, 'P2Pool'],
  [/dash\.org|dashpool|dash pool/i, 'Dash pool'],
]

function textOf(hex: string): string {
  const bytes = Uint8Array.from(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
  // eslint-disable-next-line no-control-regex
  return new TextDecoder().decode(bytes).replace(/[\u0000-\u001f\u007f\ufffd]+/g, ' ')
}

export function coinbaseTag(coinbase: DecodedTx | undefined): string {
  const hex = coinbase?.inputs[0]?.coinbase
  return hex ? textOf(hex).replace(/\s+/g, ' ').trim() : ''
}

/** The pool named in the coinbase script, or undefined when the script carries no known tag. */
export function poolOf(coinbase: DecodedTx | undefined): string | undefined {
  const tag = coinbaseTag(coinbase)
  if (!tag) return undefined
  return POOL_TAGS.find(([re]) => re.test(tag))?.[1]
}

/** Everything the coinbase pays out: the subsidy, the masternode share and the fees. */
export function blockReward(block: Pick<DecodedBlock, 'txs'>): bigint {
  return (block.txs[0]?.outputs ?? []).reduce((sum, o) => sum + o.value, 0n)
}

export function cbTxOf(
  block: Pick<DecodedBlock, 'txs'>,
): (Record<string, unknown> & { kind: 'cbTx' }) | undefined {
  const payload = block.txs[0]?.payload
  return payload?.kind === 'cbTx'
    ? (payload as Record<string, unknown> & { kind: 'cbTx' })
    : undefined
}
