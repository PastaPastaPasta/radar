import type { NetworkId } from './network'

export type LinkOutTarget =
  | {
      app: 'bridge'
      action: 'identity' | 'name' | 'token' | 'contract' | 'platform-address'
      id: string
      net: NetworkId
    }
  | { app: 'gov'; action: 'contest-vote'; label: string; net: NetworkId }
  | { app: 'gov'; action: 'proposal'; hash: string; net: NetworkId }
  | { app: 'gov'; action: 'masternodes'; net: NetworkId }
  | { app: 'pe'; path: string; net: NetworkId }
  | { app: 'hyphen'; path: string; net: NetworkId }
  | { app: 'insight'; path: string; net: NetworkId }

const BRIDGE = 'https://bridge.dashhq.org/'
const GOV = 'https://gov.dashhq.org'

const PE: Partial<Record<NetworkId, string>> = {
  mainnet: 'https://pe.dashhq.org',
  testnet: 'https://testnet.pe.dashhq.org',
}
const HYPHEN: Partial<Record<NetworkId, string>> = {
  mainnet: 'https://hy.kw.vg',
  testnet: 'https://ts.kw.vg',
}
const INSIGHT: Partial<Record<NetworkId, string>> = {
  mainnet: 'https://insight.dash.org/insight',
  testnet: 'https://insight.testnet.networks.dash.org/insight',
}

const withPath = (base: string, path: string) => base + (path.startsWith('/') ? path : `/${path}`)

/** Governance, like the other dashhq products, reads `?network=`; mainnet is the absence of it. */
function govUrl(path: string, net: NetworkId): string {
  const url = `${GOV}${path}`
  return net === 'mainnet' ? url : `${url}?network=${encodeURIComponent(net)}`
}

/** Bridge defaults to testnet, so it always gets the network. */
function bridgeUrl(params: [string, string][], net: NetworkId): string {
  const search = new URLSearchParams([...params, ['network', net]])
  return `${BRIDGE}?${search}`
}

/**
 * Where a link-out leads, or null where the app has no page for the network (the
 * explorers cover mainnet and testnet only). Bridge and Governance go to the most
 * specific page they have: Bridge prefills an identity (top up), a username
 * (register for the identity) and a Platform address (send to it); it has no screen
 * for one token or one contract, so those open its contract and landing screens.
 * Governance has a page per proposal and per contested name, but none per masternode:
 * `masternodes` opens the page where owners add their masternodes.
 */
export function linkOutUrl(target: LinkOutTarget): string | null {
  switch (target.app) {
    case 'bridge':
      switch (target.action) {
        case 'identity':
          return bridgeUrl(
            [
              ['mode', 'topup'],
              ['identity', target.id],
            ],
            target.net,
          )
        case 'name':
          return bridgeUrl(
            [
              ['mode', 'dpns'],
              ['identity', target.id],
            ],
            target.net,
          )
        case 'platform-address':
          return bridgeUrl([['address', target.id]], target.net)
        case 'contract':
          return bridgeUrl([['mode', 'contract']], target.net)
        case 'token':
          return bridgeUrl([], target.net)
      }
    case 'gov':
      switch (target.action) {
        case 'proposal':
          return govUrl(`/p/h/${encodeURIComponent(target.hash)}`, target.net)
        case 'contest-vote':
          return govUrl(`/names/${encodeURIComponent(target.label)}`, target.net)
        case 'masternodes':
          return govUrl('/masternodes', target.net)
      }
    case 'pe': {
      const base = PE[target.net]
      return base ? withPath(base, target.path) : null
    }
    case 'hyphen': {
      const base = HYPHEN[target.net]
      return base ? withPath(base, target.path) : null
    }
    case 'insight': {
      const base = INSIGHT[target.net]
      return base ? withPath(base, target.path) : null
    }
  }
}
