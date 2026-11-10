import { base58CheckDecode, base58Decode, isBase58 } from '@/lib/base58'
import { decodePlatformAddress } from '@/lib/bech32'
import { isHex } from '@/lib/hex'
import { isDevnet, type NetworkId } from '@/lib/network'
import { isBip39EnglishWord } from './bip39-words'

export type InputClass =
  | 'int'
  | 'hex64'
  | 'hex40'
  | 'base58-id'
  | 'core-address'
  | 'platform-address'
  | 'ip'
  | 'date'
  | 'dpns'
  | 'text'

export interface Tip {
  core?: number
  platform?: number
  epoch?: number
}

export interface Classified {
  raw: string
  normalized: string
  classes: InputClass[]
  /** Set when an address prefix names a network other than the current one. */
  networkHint?: NetworkId
  /**
   * `secret`: the input is a private key or a recovery phrase.
   * `possible-secret`: it might be part of one, so it is kept out of the URL, the page title and every resolver.
   */
  warning?: SecretWarning
}

export type SecretWarning = 'secret' | 'possible-secret'

const MAINNET_ADDRESS_VERSIONS = new Set([0x4c, 0x10])
const TESTNET_ADDRESS_VERSIONS = new Set([0x8c, 0x13])

const INT = /^\d{1,9}$/
const DPNS = /^[a-z0-9-]{3,63}(\.dash)?$/i
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/
const IPV6_BRACKETED = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i

function isValidDate(value: string): boolean {
  const m = DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

function validPort(port: string | undefined): boolean {
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535)
}

function isIpv4(value: string): boolean {
  const m = IPV4.exec(value)
  if (!m) return false
  return (
    [m[1], m[2], m[3], m[4]].every((o) => o !== undefined && Number(o) <= 255) && validPort(m[5])
  )
}

function isIpv6Address(value: string): boolean {
  if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return false
  let text = value
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    if (!isIpv4(tail) || tail.includes(':')) return false
    text = `${text.slice(0, lastColon + 1)}0:0`
  }
  const halves = text.split('::')
  if (halves.length > 2) return false
  const groups = halves.flatMap((half) => (half === '' ? [] : half.split(':')))
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8
}

function isIp(value: string): boolean {
  if (isIpv4(value)) return true
  const bracketed = IPV6_BRACKETED.exec(value)
  if (bracketed) return isIpv6Address(bracketed[1] ?? '') && validPort(bracketed[2])
  return isIpv6Address(value)
}

function coreAddressNetwork(value: string): 'mainnet' | 'testnet' | undefined {
  if (value.length < 26 || value.length > 35) return undefined
  const decoded = base58CheckDecode(value)
  if (decoded?.payload.length !== 20) return undefined
  if (MAINNET_ADDRESS_VERSIONS.has(decoded.version)) return 'mainnet'
  if (TESTNET_ADDRESS_VERSIONS.has(decoded.version)) return 'testnet'
  return undefined
}

const EXTENDED_KEY = /^(?:xprv|tprv|drkv|drkp)[1-9A-HJ-NP-Za-km-z]{80,}$/

const NON_LETTERS = /[^\p{L}\p{M}]+/u
const PHRASE_WORDS = 12
const PARTIAL_PHRASE_WORDS = 3

function lettersOnly(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().split(NON_LETTERS).filter(Boolean)
}

function longestEnglishRun(tokens: string[]): number {
  let longest = 0
  let current = 0
  for (const token of tokens) {
    current = isBip39EnglishWord(token) ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

function looksSecret(value: string): boolean {
  if (EXTENDED_KEY.test(value)) return true
  if (longestEnglishRun(lettersOnly(value)) >= PHRASE_WORDS) return true
  if (value.length !== 51 && value.length !== 52) return false
  const decoded = base58CheckDecode(value)
  if (!decoded || (decoded.version !== 0xcc && decoded.version !== 0xef)) return false
  return decoded.payload.length === 32 || decoded.payload.length === 33
}

/**
 * A phrase being typed, or one in a language whose wordlist is not bundled. Only inputs made of
 * separate words qualify, so a mistyped hash or ID stays ordinary text.
 */
function looksPartlySecret(value: string): boolean {
  const tokens = lettersOnly(value)
  if (longestEnglishRun(tokens) >= PARTIAL_PHRASE_WORDS) return true
  return tokens.length >= PHRASE_WORDS && value.split(/\s+/).length >= PHRASE_WORDS
}

function isBase58Id(value: string): boolean {
  if (value.length < 43 || value.length > 44 || !isBase58(value)) return false
  return base58Decode(value).length === 32
}

/** Whether an address of `found` network belongs on `net`. Devnets share testnet's prefixes. */
function hintFor(found: 'mainnet' | 'testnet', net: NetworkId): NetworkId | undefined {
  if (found === 'mainnet') return net === 'mainnet' ? undefined : 'mainnet'
  return net === 'testnet' || isDevnet(net) ? undefined : 'testnet'
}

export function classify(input: string, net: NetworkId, tip?: Tip): Classified {
  const raw = input
  const trimmed = input.trim()
  const classes: InputClass[] = []
  const result = (normalized: string, networkHint?: NetworkId): Classified => ({
    raw,
    normalized,
    classes,
    ...(networkHint && { networkHint }),
  })

  if (trimmed.length === 0) return result('')

  const withheld = (warning: SecretWarning): Classified => ({
    raw,
    normalized: '',
    classes,
    warning,
  })
  if (looksSecret(trimmed)) return withheld('secret')

  const hex = trimmed.replace(/^0x/i, '')
  if (isHex(hex, 32)) {
    classes.push('hex64')
    return result(hex.toLowerCase())
  }
  if (isHex(hex, 20)) {
    classes.push('hex40')
    return result(hex.toLowerCase())
  }

  const coreNet = coreAddressNetwork(trimmed)
  if (coreNet) {
    classes.push('core-address')
    return result(trimmed, hintFor(coreNet, net))
  }

  const platform = decodePlatformAddress(trimmed)
  if (platform) {
    classes.push('platform-address')
    return result(
      trimmed.toLowerCase(),
      hintFor(platform.hrp === 'dash' ? 'mainnet' : 'testnet', net),
    )
  }

  if (isBase58Id(trimmed)) {
    classes.push('base58-id')
    return result(trimmed)
  }

  if (isIp(trimmed)) {
    classes.push('ip')
    return result(trimmed.toLowerCase())
  }

  if (looksPartlySecret(trimmed)) return withheld('possible-secret')

  if (INT.test(trimmed)) {
    const n = Number(trimmed)
    const limits = [tip?.core, tip?.platform, tip?.epoch].filter(
      (v): v is number => v !== undefined,
    )
    if (limits.length === 0 || limits.some((limit) => n <= limit)) classes.push('int')
  }
  if (isValidDate(trimmed)) classes.push('date')
  if (DPNS.test(trimmed)) classes.push('dpns')
  const isNumber = /^\d+$/.test(trimmed)
  if (trimmed.length >= 2 && !isNumber && !classes.includes('date')) classes.push('text')

  const lower = classes.includes('dpns') ? trimmed.toLowerCase() : trimmed
  return result(lower)
}
