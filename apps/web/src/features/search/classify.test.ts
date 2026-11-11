import { beforeAll, describe, expect, it } from 'vitest'
import { ensureWordlist } from './wordlist'
import type { NetworkId } from '@/lib/network'
import { classify, type InputClass } from './classify'

const MAINNET_BLOCK = '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6'
const TESTNET_BLOCK = '00000bafbc94add76cb75e2ec92894837288a481e5c005f6563d91623bf8bc2c'
const TXID = 'e0028eb9648db56b1ac77cf090b99048a8007e2bb64b74b4a4cb7c4d8d6e6e47'
const PKH = '62e907b15cbf27d5425399ebf6f0fb50ebb88f18'
const DPNS_CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const DASHPAY_CONTRACT = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'

const MAINNET_P2PKH = 'XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc'
const MAINNET_P2SH = '7iRPy8FEHBzbChrktsG85YbDZ3SuiCxsNq'
const TESTNET_P2PKH = 'yhq7ifNCtTKEpY4Yu5XPCcztQco6Fh6JsZ'
const TESTNET_P2SH = '8erZsDLXAvEFj3B4ojXDykVBsQGC5NnCnU'
const MAINNET_PLATFORM = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs'
const MAINNET_PLATFORM_P2SH = 'dash1sppl5xpu70aka8nacc4kj2htflydspzkxch4cad6'
const TESTNET_PLATFORM = 'tdash1krma5z3ttj75la4m93xcndna9ullamq9y5fzq2j7'
const TESTNET_PLATFORM_P2SH = 'tdash1sppl5xpu70aka8nacc4kj2htflydspzkxc8jtru5'

interface Row {
  name: string
  input: string
  net: NetworkId
  classes: InputClass[]
  normalized?: string
  hint?: NetworkId
}

const PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'

const rows: Row[] = [
  { name: 'Core height', input: '2569992', net: 'mainnet', classes: ['int', 'dpns'] },
  { name: 'short number', input: '12', net: 'mainnet', classes: ['int'] },
  { name: 'epoch-sized number', input: '1234', net: 'testnet', classes: ['int', 'dpns'] },
  { name: 'nine digits', input: '123456789', net: 'mainnet', classes: ['int', 'dpns'] },
  { name: 'ten digits is not an int', input: '1234567890', net: 'mainnet', classes: ['dpns'] },
  { name: 'mainnet block hash', input: MAINNET_BLOCK, net: 'mainnet', classes: ['hex64'] },
  { name: 'testnet block hash', input: TESTNET_BLOCK, net: 'testnet', classes: ['hex64'] },
  {
    name: 'upper-case txid',
    input: TXID.toUpperCase(),
    net: 'mainnet',
    classes: ['hex64'],
    normalized: TXID,
  },
  {
    name: '0x-prefixed hash',
    input: `0x${TXID}`,
    net: 'testnet',
    classes: ['hex64'],
    normalized: TXID,
  },
  { name: 'public-key hash', input: PKH, net: 'mainnet', classes: ['hex40'], normalized: PKH },
  { name: 'identity or contract id', input: DPNS_CONTRACT, net: 'mainnet', classes: ['base58-id'] },
  {
    name: 'contract id on testnet',
    input: DASHPAY_CONTRACT,
    net: 'testnet',
    classes: ['base58-id'],
  },
  {
    name: 'id keeps its case',
    input: ` ${DPNS_CONTRACT} `,
    net: 'mainnet',
    classes: ['base58-id'],
    normalized: DPNS_CONTRACT,
  },
  {
    name: 'mainnet P2PKH address',
    input: MAINNET_P2PKH,
    net: 'mainnet',
    classes: ['core-address'],
  },
  { name: 'mainnet P2SH address', input: MAINNET_P2SH, net: 'mainnet', classes: ['core-address'] },
  {
    name: 'testnet P2PKH address',
    input: TESTNET_P2PKH,
    net: 'testnet',
    classes: ['core-address'],
  },
  { name: 'testnet P2SH address', input: TESTNET_P2SH, net: 'testnet', classes: ['core-address'] },
  {
    name: 'testnet address on mainnet',
    input: TESTNET_P2PKH,
    net: 'mainnet',
    classes: ['core-address'],
    hint: 'testnet',
  },
  {
    name: 'mainnet address on testnet',
    input: MAINNET_P2PKH,
    net: 'testnet',
    classes: ['core-address'],
    hint: 'mainnet',
  },
  {
    name: 'testnet address on a devnet',
    input: TESTNET_P2PKH,
    net: 'devnet-paloma',
    classes: ['core-address'],
  },
  {
    name: 'mainnet address on a devnet',
    input: MAINNET_P2PKH,
    net: 'devnet-paloma',
    classes: ['core-address'],
    hint: 'mainnet',
  },
  {
    name: 'mainnet Platform address',
    input: MAINNET_PLATFORM,
    net: 'mainnet',
    classes: ['platform-address'],
  },
  {
    name: 'mainnet Platform P2SH address',
    input: MAINNET_PLATFORM_P2SH,
    net: 'mainnet',
    classes: ['platform-address'],
  },
  {
    name: 'testnet Platform address',
    input: TESTNET_PLATFORM,
    net: 'testnet',
    classes: ['platform-address'],
  },
  {
    name: 'testnet Platform P2SH address',
    input: TESTNET_PLATFORM_P2SH,
    net: 'testnet',
    classes: ['platform-address'],
  },
  {
    name: 'testnet Platform address on mainnet',
    input: TESTNET_PLATFORM,
    net: 'mainnet',
    classes: ['platform-address'],
    hint: 'testnet',
  },
  {
    name: 'mainnet Platform address on testnet',
    input: MAINNET_PLATFORM,
    net: 'testnet',
    classes: ['platform-address'],
    hint: 'mainnet',
  },
  {
    name: 'upper-case Platform address',
    input: MAINNET_PLATFORM.toUpperCase(),
    net: 'mainnet',
    classes: ['platform-address'],
    normalized: MAINNET_PLATFORM,
  },
  { name: 'IPv4', input: '75.119.128.71', net: 'mainnet', classes: ['ip'] },
  { name: 'IPv4 with port', input: '75.119.128.71:9999', net: 'mainnet', classes: ['ip'] },
  { name: 'testnet IPv4 with port', input: '54.12.9.1:19999', net: 'testnet', classes: ['ip'] },
  { name: 'IPv6', input: '2001:db8::1', net: 'mainnet', classes: ['ip'] },
  {
    name: 'bracketed IPv6 with port',
    input: '[2001:db8::1]:9999',
    net: 'mainnet',
    classes: ['ip'],
  },
  {
    name: 'full IPv6',
    input: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    net: 'mainnet',
    classes: ['ip'],
  },
  { name: 'IPv4-mapped IPv6', input: '::ffff:192.0.2.1', net: 'mainnet', classes: ['ip'] },
  { name: 'out-of-range octet', input: '256.1.1.1', net: 'mainnet', classes: ['text'] },
  { name: 'out-of-range port', input: '1.2.3.4:70000', net: 'mainnet', classes: ['text'] },
  { name: 'date', input: '2026-10-01', net: 'mainnet', classes: ['date', 'dpns'] },
  { name: 'impossible date', input: '2026-02-30', net: 'mainnet', classes: ['dpns', 'text'] },
  { name: 'name with suffix', input: 'pshenmic.dash', net: 'mainnet', classes: ['dpns', 'text'] },
  { name: 'name', input: 'alice', net: 'mainnet', classes: ['dpns', 'text'] },
  {
    name: 'upper-case name',
    input: 'Alice.Dash',
    net: 'testnet',
    classes: ['dpns', 'text'],
    normalized: 'alice.dash',
  },
  { name: 'name with hyphen', input: 'dash-evo', net: 'mainnet', classes: ['dpns', 'text'] },
  { name: 'two letters', input: 'ab', net: 'mainnet', classes: ['text'] },
  { name: 'phrase', input: 'dash evo tool', net: 'mainnet', classes: ['text'] },
  { name: 'one letter', input: 'a', net: 'mainnet', classes: [] },
  { name: 'empty', input: '   ', net: 'mainnet', classes: [] },
  { name: 'hex of another length', input: 'deadbeef', net: 'mainnet', classes: ['dpns', 'text'] },
  {
    name: 'address with a bad checksum',
    input: `${MAINNET_P2PKH.slice(0, -1)}d`,
    net: 'mainnet',
    classes: ['dpns', 'text'],
  },
  {
    name: 'Platform address with a bad checksum',
    input: `${MAINNET_PLATFORM.slice(0, -1)}t`,
    net: 'mainnet',
    classes: ['dpns', 'text'],
  },
]

beforeAll(async () => {
  await ensureWordlist()
})

describe('classify', () => {
  it.each(rows)('$name', ({ input, net, classes, normalized, hint }) => {
    const result = classify(input, net)
    expect(result.classes).toEqual(classes)
    expect(result.networkHint).toBe(hint)
    expect(result.raw).toBe(input)
    if (normalized !== undefined) expect(result.normalized).toBe(normalized)
  })

  it('drops int when it exceeds every known tip', () => {
    const tip = { core: 2_000_000, platform: 5000, epoch: 90 }
    expect(classify('90', 'mainnet', tip).classes).toEqual(['int'])
    expect(classify('2000000', 'mainnet', tip).classes).toEqual(['int', 'dpns'])
    expect(classify('2000001', 'mainnet', tip).classes).toEqual(['dpns'])
    expect(classify('99', 'mainnet', { epoch: 90 }).classes).toEqual([])
  })

  it('does not search private keys or recovery phrases', () => {
    const wif = '7rUXQhHrDyLDeWVaDUCM6G7VMYeMpSLZ1Vt5A6dhZAeqeRsbLTx'
    for (const input of [
      PHRASE,
      '1. abandon 2. ability 3. able 4. about 5. above 6. absent 7. absorb 8. abstract 9. absurd 10. abuse 11. access 12. accident',
      `xprv${'9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'}`,
    ]) {
      const result = classify(input, 'mainnet')
      expect(result.classes).toEqual([])
      expect(result.warning).toBe('secret')
    }
    expect(classify(wif, 'mainnet').warning).toBeUndefined()
  })
})

const WORDS = PHRASE.split(' ')

const SPANISH = 'ábaco abdomen abeja abierto abogado abono aborto abrazo abrir abuelo abuso acabar'
const FRENCH =
  'abaisser abandon abdiquer abeille abolir aborder aboutir aboyer abrasif abreuver abriter abroger'
const JAPANESE =
  'あいこくしん\u3000あいさつ\u3000あいだ\u3000あおぞら\u3000あかちゃん\u3000あきる\u3000あけがた\u3000あける\u3000あこがれる\u3000あさい\u3000あさひ\u3000あしあと'
const CHINESE = '的 一 是 在 不 了 有 和 人 这 中 大'

const secretRows: { name: string; input: string; warning: 'secret' }[] = [
  { name: 'a plain phrase', input: PHRASE, warning: 'secret' },
  { name: 'a phrase in double quotes', input: `"${PHRASE}"`, warning: 'secret' },
  { name: 'a phrase in curly quotes', input: `“${PHRASE}”`, warning: 'secret' },
  { name: 'a phrase in brackets', input: `[${PHRASE}]`, warning: 'secret' },
  { name: 'a phrase with a prefix', input: `my seed: ${PHRASE}`, warning: 'secret' },
  { name: 'a phrase with a short prefix', input: `it is ${PHRASE}`, warning: 'secret' },
  { name: 'a comma-separated phrase', input: WORDS.join(', '), warning: 'secret' },
  { name: 'a hyphen-joined phrase', input: WORDS.join('-'), warning: 'secret' },
  { name: 'a slash-joined phrase', input: WORDS.join('/'), warning: 'secret' },
  { name: 'a multi-line phrase', input: WORDS.join('\n'), warning: 'secret' },
  {
    name: 'a phrase on two lines with tabs',
    input: `${WORDS.slice(0, 6).join(' ')}\t\n${WORDS.slice(6).join(' ')}`,
    warning: 'secret',
  },
  { name: 'an upper-case phrase', input: PHRASE.toUpperCase(), warning: 'secret' },
  { name: 'a 24-word phrase', input: [...WORDS, ...WORDS].join(' '), warning: 'secret' },
  {
    name: 'a numbered phrase',
    input: WORDS.map((w, i) => `${i + 1}.${w}`).join(' '),
    warning: 'secret',
  },
  { name: 'a phrase followed by a passphrase', input: `${PHRASE} hunter2`, warning: 'secret' },
]

const possibleRows: { name: string; input: string }[] = [
  { name: 'five words typed so far', input: WORDS.slice(0, 5).join(' ') },
  { name: 'eleven words typed so far', input: WORDS.slice(0, 11).join(' ') },
  { name: 'a partial phrase with a prefix', input: 'seed: abandon ability able about above' },
  { name: 'a partial phrase in quotes', input: '"abandon ability able about above' },
  { name: 'quoted words with commas', input: '"abandon", "ability", "able", "about", "above"' },
  { name: 'a partial phrase on several lines', input: WORDS.slice(0, 6).join('\n') },
  { name: 'a partial phrase in upper case', input: WORDS.slice(0, 5).join(' ').toUpperCase() },
  {
    name: 'a phrase with one misspelt word',
    input: WORDS.map((w, i) => (i === 5 ? 'absnt' : w)).join(' '),
  },
  { name: 'a Spanish phrase', input: SPANISH },
  { name: 'comma-joined Spanish words', input: SPANISH.split(' ').join(',') },
  { name: 'comma-and-space Spanish words', input: SPANISH.split(' ').join(', ') },
  { name: 'a French phrase', input: FRENCH },
  { name: 'a decomposed French phrase', input: FRENCH.normalize('NFD') },
  { name: 'a Japanese phrase with ideographic spaces', input: JAPANESE },
  { name: 'a Chinese phrase with spaces', input: CHINESE },
  { name: 'a quoted Spanish phrase', input: `«${SPANISH}»` },
]

describe('classify secrets', () => {
  it.each(secretRows)('flags $name', ({ input, warning }) => {
    const result = classify(input, 'mainnet')
    expect(result.warning).toBe(warning)
    expect(result.classes).toEqual([])
    expect(result.normalized).toBe('')
  })

  it.each(possibleRows)('withholds $name as part of a phrase', ({ input }) => {
    const result = classify(input, 'mainnet')
    expect(result.warning).toBe('possible-secret')
    expect(result.networkHint).toBeUndefined()
  })

  it.each([
    'dashpay',
    'DashPay Token',
    'pshenmic.dash',
    'alice-bob.dash',
    'dpns',
    'dash platform',
    'abandon ability',
    'fire wall',
    'about above',
    'Evo Bridge Wallet',
    'payments for masternodes',
    'my contract is named dashpay',
    'masternode payments in epoch ninety',
    'abandon-ability',
    'game-zone-arena.dash',
    'happy-cat-dog.dash',
    'happy-cat-dog',
    'super-cool-dog',
    'abandon-ability-able-about-above',
    'abandon.ability.able.about.above',
    'Gold Coin Token',
    'Test Token Alpha',
    'real estate token',
    'world cup ticket',
    'music artist fan club',
    'abandon ability able about',
    'abandon, ability, able, about',
    'how to buy dash with a card',
    'what is a masternode payment',
    'latest block on the dash network',
    'dash price in usd today',
    'which pool found the last block',
    'is my transaction confirmed yet',
    'the network is slow today why',
    'alice bob carol dave eve frank',
    'abandon ability able about-above',
    '2569992',
    '2026-10-01',
    '75.119.128.71',
    'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    '00000ffd590b1485b3caadc19b22e6379c733355108f107a430458cdf3407ab6',
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
    '7rUXQhHrDyLDeWVaDUCM6G7VMYeMpSLZ1Vt5A6dhZAeqeRsbLTx',
    '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy1',
  ])('does not flag %s', (input) => {
    expect(classify(input, 'mainnet').warning).toBeUndefined()
  })
})

describe('classify possible phrases', () => {
  it('counts five consecutive tokens with at most one that is not an English word', () => {
    expect(classify('abandon ability able about above', 'mainnet').warning).toBe('possible-secret')
    expect(classify('abandon ability able about zzzz above', 'mainnet').warning).toBe(
      'possible-secret',
    )
    expect(classify('abandon ability zzzz about zzzz above', 'mainnet').warning).toBeUndefined()
    expect(classify('abandon ability able zzzz zzzz above', 'mainnet').warning).toBeUndefined()
  })

  it('flags a phrase with one typo among eight words', () => {
    const input = 'abandon ability able about abuve absent absorb abstract absurd'
    expect(classify(input, 'mainnet').warning).toBe('possible-secret')
    expect(classify(input.replaceAll(' ', ', '), 'mainnet').warning).toBe('possible-secret')
  })

  it('counts a last token that is still being typed as a word', () => {
    expect(classify('abandon ability able about abov', 'mainnet').warning).toBe('possible-secret')
    expect(classify('abandon ability able about ab', 'mainnet').warning).toBe('possible-secret')
    expect(classify('abandon ability able zzzz a', 'mainnet').warning).toBeUndefined()
    expect(classify('abandon ability able zzzz xq', 'mainnet').warning).toBeUndefined()
    expect(classify('abandon ability able ab about', 'mainnet').warning).toBe('possible-secret')
  })

  it('never flags anything that parses as a name', () => {
    for (const input of ['abandon-ability-able-about-above-absent', 'game-zone-arena', 'dash']) {
      const result = classify(input, 'mainnet')
      expect(result.classes).toContain('dpns')
      expect(result.warning).toBeUndefined()
    }
  })

  it('treats a hyphen-joined list of twelve letter words as one word', () => {
    expect(classify(SPANISH.split(' ').join('-'), 'mainnet').warning).toBeUndefined()
  })

  it('keeps the classes of a partial phrase so local resolvers still run', () => {
    const result = classify('abandon ability able about above', 'mainnet')
    expect(result.classes).toEqual(['text'])
    expect(classify(PHRASE, 'mainnet').classes).toEqual([])
  })
})
