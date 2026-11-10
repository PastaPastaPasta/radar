import type { NetworkId } from '@/lib/network'

/** "Mainnet", "Testnet", "Devnet ruby": how a network is named in text. The id itself is the slug. */
export function networkName(net: NetworkId): string {
  if (net === 'mainnet') return 'Mainnet'
  if (net === 'testnet') return 'Testnet'
  return `Devnet ${net.replace(/^devnet-/, '')}`
}
