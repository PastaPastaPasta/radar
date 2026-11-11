import { beforeAll, describe, expect, it } from 'vitest'
import { ensureWordlist } from '@/features/search'
import { base58CheckEncode } from '@/lib/base58'
import { interpretScan, MAX_SCAN_CHARS } from './interpret'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const TESTNET_ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'
const TXID = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'
const WIF = base58CheckEncode(0xcc, Uint8Array.from([...new Uint8Array(32).fill(9), 1]))
const XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'

beforeAll(async () => {
  await ensureWordlist()
})

describe('interpretScan', () => {
  it('turns an address into a search @IN-11', () => {
    const out = interpretScan(ADDRESS, 'mainnet')
    expect(out).toMatchObject({ kind: 'search', query: ADDRESS })
  })

  it('reads the address out of a payment URI @IN-11', () => {
    expect(interpretScan(`dash:${ADDRESS}?amount=1.5&label=Coffee`, 'mainnet')).toMatchObject({
      kind: 'search',
      query: ADDRESS,
    })
    expect(interpretScan(`DASH:${ADDRESS}`, 'mainnet')).toMatchObject({ query: ADDRESS })
    expect(interpretScan(`dash://${ADDRESS}`, 'mainnet')).toMatchObject({ query: ADDRESS })
  })

  it('looks up a transaction id, trimming whitespace @IN-11', () => {
    expect(interpretScan(`\n ${TXID.toUpperCase()} \n`, 'mainnet')).toMatchObject({
      kind: 'search',
      query: TXID,
    })
  })

  it('keeps a testnet address on testnet for the search to hint at @IN-16', () => {
    const out = interpretScan(TESTNET_ADDRESS, 'mainnet')
    expect(out.kind).toBe('search')
    if (out.kind === 'search') expect(out.classified.networkHint).toBe('testnet')
  })

  it.each([
    ['a recovery phrase', PHRASE],
    ['a WIF private key', WIF],
    ['an extended private key', XPRV],
    ['a private key inside a payment URI', `dash:${WIF}?amount=1`],
    ['a recovery phrase after a prefix', `my seed: ${PHRASE}`],
  ])('refuses %s without handing it on @IN-11', (_name, text) => {
    const out = interpretScan(text, 'mainnet')
    expect(out).toEqual({ kind: 'refused' })
    expect(JSON.stringify(out)).not.toContain(text.slice(0, 20))
  })

  it('refuses a partial phrase as well @IN-11', () => {
    expect(interpretScan('abandon ability able about above', 'mainnet')).toEqual({
      kind: 'refused',
    })
  })

  it.each([
    ['nothing', '   '],
    ['one character', 'a'],
    ['a long web address', `https://example.org/${'x'.repeat(MAX_SCAN_CHARS)}`],
  ])('does not search for %s @IN-11', (_name, text) => {
    expect(interpretScan(text, 'mainnet')).toEqual({ kind: 'unreadable' })
  })
})
