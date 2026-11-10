export type NetworkId = 'mainnet' | 'testnet' | `devnet-${string}`
export interface DevnetConfig {
  name: string
  dapiAddresses: string[]
  quorumUrl?: string
}

const DEVNET_PATTERN = /^devnet-[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function asNetworkId(value: string): NetworkId | undefined {
  if (value === 'mainnet' || value === 'testnet') return value
  return DEVNET_PATTERN.test(value) ? (value as NetworkId) : undefined
}

export function parseNetworkParam(
  network?: string,
  legacyNet?: string,
): { net: NetworkId; redirect: boolean } {
  if (network !== undefined) {
    const net = asNetworkId(network)
    return { net: net ?? 'mainnet', redirect: net === undefined || legacyNet !== undefined }
  }
  if (legacyNet !== undefined) {
    return { net: asNetworkId(legacyNet) ?? 'mainnet', redirect: true }
  }
  return { net: 'mainnet', redirect: false }
}

export function networkSearch(net: NetworkId): { network?: string } {
  return net === 'mainnet' ? {} : { network: net }
}

export const isDevnet = (n: NetworkId): n is `devnet-${string}` => n.startsWith('devnet-')
