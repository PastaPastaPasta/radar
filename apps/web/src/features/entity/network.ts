import { useSearch } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { parseNetworkParam, type NetworkId } from '@/lib/network'
import {
  DECENTRALIZED_PARAM,
  getSourceModeState,
  SOURCES_PARAM,
  subscribeSourceMode,
} from '@/lib/source-mode'

/** The network the current URL names: `?network=` absent is mainnet. The only way components read it. */
export function useNetwork(): NetworkId {
  return useSearch({
    strict: false,
    select: (s) => parseNetworkParam(s.network, s.net).net,
  })
}

export { networkName } from '@/ui/base'

function withParam(path: string, name: string, value: string): string {
  const hash = path.indexOf('#')
  const base = hash < 0 ? path : path.slice(0, hash)
  const tail = hash < 0 ? '' : path.slice(hash)
  const joiner = base.includes('?') ? '&' : '?'
  return `${base}${joiner}${name}=${encodeURIComponent(value)}${tail}`
}

/** Adds `network=` to an in-app path or path-with-query, unless it is mainnet. */
export function withNetwork(path: string, net: NetworkId): string {
  return net === 'mainnet' ? path : withParam(path, 'network', net)
}

/**
 * Adds `sources=decentralized` while the address is what keeps Decentralized only mode on, so a link opened in a new
 * tab stays in the mode. A remembered choice needs nothing in the address.
 */
export function withSourceMode(path: string): string {
  return getSourceModeState().fromLink ? withParam(path, SOURCES_PARAM, DECENTRALIZED_PARAM) : path
}

const modeFromLink = () => getSourceModeState().fromLink

/** Draws the caller again when the address starts or stops keeping the mode on, so the links it built follow. */
export function useSourceModeLink(): boolean {
  return useSyncExternalStore(subscribeSourceMode, modeFromLink, () => false)
}
