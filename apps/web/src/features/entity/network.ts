import { useSearch } from '@tanstack/react-router'
import { parseNetworkParam, type NetworkId } from '@/lib/network'

/** The network the current URL names: `?network=` absent is mainnet. The only way components read it. */
export function useNetwork(): NetworkId {
  return useSearch({
    strict: false,
    select: (s) => parseNetworkParam(s.network, s.net).net,
  })
}

export function networkName(net: NetworkId): string {
  if (net === 'mainnet') return 'Mainnet'
  if (net === 'testnet') return 'Testnet'
  return net
}

/** Adds `network=` to an in-app path or path-with-query, unless it is mainnet. */
export function withNetwork(path: string, net: NetworkId): string {
  if (net === 'mainnet') return path
  const hash = path.indexOf('#')
  const base = hash < 0 ? path : path.slice(0, hash)
  const tail = hash < 0 ? '' : path.slice(hash)
  const joiner = base.includes('?') ? '&' : '?'
  return `${base}${joiner}network=${encodeURIComponent(net)}${tail}`
}
