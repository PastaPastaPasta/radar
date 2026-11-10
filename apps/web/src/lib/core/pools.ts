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

export function coinbaseTagOf(scriptHex: string | undefined): string {
  return scriptHex ? textOf(scriptHex).replace(/\s+/g, ' ').trim() : ''
}

/** The pool named in a coinbase scriptSig (hex), or undefined when it carries no known tag. */
export function poolOfCoinbase(scriptHex: string | undefined): string | undefined {
  const tag = coinbaseTagOf(scriptHex)
  return tag ? POOL_TAGS.find(([re]) => re.test(tag))?.[1] : undefined
}
