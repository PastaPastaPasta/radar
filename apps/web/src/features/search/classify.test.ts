import { describe, expect, it } from 'vitest'
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
    const phrase =
      'abandon ability able about above absent absorb abstract absurd abuse access accident'
    for (const input of [
      phrase,
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
