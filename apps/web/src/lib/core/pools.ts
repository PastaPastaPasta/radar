/**
 * Mining pools by the tag they put in the coinbase script. First match wins. The tag is whatever the miner
 * wrote, so a match says what the tag claims, never who mined the block.
 */
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

export function coinbaseTagOf(scriptHex: string | undefined): string {
  if (!scriptHex) return ''
  const bytes = Uint8Array.from(scriptHex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
  return (
    new TextDecoder()
      .decode(bytes)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f\ufffd\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** The pool a coinbase scriptSig (hex) says it is from, or undefined when it carries no known tag. */
export function poolOfCoinbase(scriptHex: string | undefined): string | undefined {
  const tag = coinbaseTagOf(scriptHex)
  return tag ? POOL_TAGS.find(([re]) => re.test(tag))?.[1] : undefined
}
