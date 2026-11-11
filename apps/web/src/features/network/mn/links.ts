import type { NetworkId } from '@/lib/network'

/** Governance is where masternode owners vote; it reads `?network=` like the other dashhq products. */
export function govUrl(net: NetworkId): string {
  const base = 'https://gov.dashhq.org/'
  return net === 'mainnet' ? base : `${base}?network=${encodeURIComponent(net)}`
}
