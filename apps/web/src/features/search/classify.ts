import { base58CheckDecode, base58Decode, isBase58 } from '@/lib/base58'
import { decodePlatformAddress } from '@/lib/bech32'
import { isHex } from '@/lib/hex'
import { isDevnet, type NetworkId } from '@/lib/network'
import { wordlist } from './wordlist'

export type InputClass =
  | 'int'
  | 'hex64'
  | 'hex40'
  | 'base58-id'
  | 'document-path'
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
   * `secret`: the input is a private key or a recovery phrase, so it has no classes.
   * `possible-secret`: it might be part of one. Both are kept out of the URL, the page title, history
   * and every resolver that sends anything off the device; only local resolvers still run.
   */
  warning?: SecretWarning
}

export type SecretWarning = 'secret' | 'possible-secret'

const MAINNET_ADDRESS_VERSIONS = new Set([0x4c, 0x10])
const TESTNET_ADDRESS_VERSIONS = new Set([0x8c, 0x13])

const INT = /^\d{1,9}$/

/** Only a number needs the chain tips, to say which chain it could be a height or an epoch of. */
export const needsTips = (input: string): boolean => INT.test(input.trim())
const DPNS = /^[a-z0-9-]{3,63}(\.dash)?$/i
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::(\d{1,5}))?$/
const DOCUMENT_PATH =
  /^([1-9A-HJ-NP-Za-km-z]{43,44})\/([A-Za-z][A-Za-z0-9_-]{0,63})\/([1-9A-HJ-NP-Za-km-z]{43,44})$/
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
const PARTIAL_PHRASE_WORDS = 5
const PHRASE_SEPARATORS = /[\s,;，、；"'“”‘’«»‹›「」『』()[\]{}]+/u
const LETTERS_ONLY = /^[\p{L}\p{M}]+$/u

function lettersOnly(value: string): string[] {
  return value.normalize('NFKC').toLowerCase().split(NON_LETTERS).filter(Boolean)
}

type Words = NonNullable<ReturnType<typeof wordlist>>

function longestEnglishRun(tokens: string[], words: Words): number {
  let longest = 0
  let current = 0
  for (const token of tokens) {
    current = words.isBip39EnglishWord(token) ? current + 1 : 0
    longest = Math.max(longest, current)
  }
  return longest
}

function looksSecret(value: string, words: Words | undefined): boolean {
  if (EXTENDED_KEY.test(value)) return true
  const tokens = lettersOnly(value)
  if (words ? longestEnglishRun(tokens, words) >= PHRASE_WORDS : tokens.length >= PHRASE_WORDS) {
    return true
  }
  if (value.length !== 51 && value.length !== 52) return false
  const decoded = base58CheckDecode(value)
  if (!decoded || (decoded.version !== 0xcc && decoded.version !== 0xef)) return false
  return decoded.payload.length === 32 || decoded.payload.length === 33
}

/**
 * Words separated only by whitespace, commas, semicolons, quotes or brackets (hyphens and dots join a
 * token into one word, and a valid name is never a phrase). Flagged: 5 or more consecutive tokens with
 * at most one that is not an English recovery-phrase word, so a typo or a gap doesn't hide a phrase;
 * a last token of 2 or more letters that starts a phrase word counts as one, because it is still being
 * typed. Also flagged: 12 letter-only words in a row, of any language.
 */
function looksPartlySecret(value: string, words: Words | undefined): boolean {
  if (DPNS.test(value)) return false
  const tokens = value
    .normalize('NFKC')
    .toLowerCase()
    .split(PHRASE_SEPARATORS)
    .filter((token) => token !== '')
  if (!words) return tokens.length >= PARTIAL_PHRASE_WORDS
  const last = tokens.length - 1
  const isWord = tokens.map(
    (token, i) =>
      words.isBip39EnglishWord(token) ||
      (i === last && token.length >= 2 && words.isBip39EnglishPrefix(token)),
  )
  let letters = 0
  for (const [i, token] of tokens.entries()) {
    letters = LETTERS_ONLY.test(token) ? letters + 1 : 0
    if (letters >= PHRASE_WORDS) return true
    if (i + 1 >= PARTIAL_PHRASE_WORDS) {
      const window = isWord.slice(i + 1 - PARTIAL_PHRASE_WORDS, i + 1)
      if (window.filter((word) => !word).length <= 1) return true
    }
  }
  return false
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
  const result = (
    normalized: string,
    networkHint?: NetworkId,
    warning?: SecretWarning,
  ): Classified => ({
    raw,
    normalized,
    classes,
    ...(networkHint && { networkHint }),
    ...(warning && { warning }),
  })

  if (trimmed.length === 0) return result('')

  const withheld = (warning: SecretWarning): Classified => ({
    raw,
    normalized: '',
    classes,
    warning,
  })
  const words = wordlist()
  if (looksSecret(trimmed, words)) return withheld('secret')

  const path = DOCUMENT_PATH.exec(trimmed)
  if (path && isBase58Id(path[1] ?? '') && isBase58Id(path[3] ?? '')) {
    classes.push('document-path')
    return result(trimmed)
  }

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

  const partial = looksPartlySecret(trimmed, words) ? 'possible-secret' : undefined

  if (INT.test(trimmed)) {
    const n = Number(trimmed)
    const limits = [tip?.core, tip?.platform, tip?.epoch].filter(
      (v): v is number => v !== undefined,
    )
    // A tip that is not known yet could still cover the number, so it is only excluded once all three are known.
    if (limits.length < 3 || limits.some((limit) => n <= limit)) classes.push('int')
  }
  if (isValidDate(trimmed)) classes.push('date')
  if (DPNS.test(trimmed)) classes.push('dpns')
  const isNumber = /^\d+$/.test(trimmed)
  if (trimmed.length >= 2 && !isNumber && !classes.includes('date')) classes.push('text')

  const lower = classes.includes('dpns') ? trimmed.toLowerCase() : trimmed
  return result(lower, undefined, partial)
}
