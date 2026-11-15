import { base58CheckDecode } from './base58'
import { isDevnet, type NetworkId } from './network'

const MAINNET_ADDRESS_VERSIONS = new Set([0x4c, 0x10])
const TESTNET_ADDRESS_VERSIONS = new Set([0x8c, 0x13])

/** The network a Core address (P2PKH or P2SH) belongs to, or undefined when the value is not one. */
export function coreAddressNetwork(value: string): 'mainnet' | 'testnet' | undefined {
  if (value.length < 26 || value.length > 35) return undefined
  const decoded = base58CheckDecode(value)
  if (decoded?.payload.length !== 20) return undefined
  if (MAINNET_ADDRESS_VERSIONS.has(decoded.version)) return 'mainnet'
  if (TESTNET_ADDRESS_VERSIONS.has(decoded.version)) return 'testnet'
  return undefined
}

/** The network to point to when a value found on `found` is read on `net`; undefined when `net` is right for it. */
export function networkHintFor(
  found: 'mainnet' | 'testnet',
  net: NetworkId,
): NetworkId | undefined {
  if (found === 'mainnet') return net === 'mainnet' ? undefined : 'mainnet'
  return net === 'testnet' || isDevnet(net) ? undefined : 'testnet'
}
