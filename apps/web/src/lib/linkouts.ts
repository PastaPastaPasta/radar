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

function explorerUrl(
  bases: Partial<Record<NetworkId, string>>,
  target: { path: string; net: NetworkId },
) {
  const base = bases[target.net]
  if (!base) return null
  return base + (target.path.startsWith('/') ? target.path : `/${target.path}`)
}

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

function bridgeParams(target: Extract<LinkOutTarget, { app: 'bridge' }>): [string, string][] {
  switch (target.action) {
    case 'identity':
      return [
        ['mode', 'topup'],
        ['identity', target.id],
      ]
    case 'name':
      return [
        ['mode', 'dpns'],
        ['identity', target.id],
      ]
    case 'platform-address':
      return [['address', target.id]]
    case 'contract':
      return [['mode', 'contract']]
    case 'token':
      return []
  }
}

function govPath(target: Extract<LinkOutTarget, { app: 'gov' }>): string {
  switch (target.action) {
    case 'proposal':
      return `/p/h/${encodeURIComponent(target.hash)}`
    case 'contest-vote':
      return `/names/${encodeURIComponent(target.label)}`
    case 'masternodes':
      return '/masternodes'
  }
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
      return bridgeUrl(bridgeParams(target), target.net)
    case 'gov':
      return govUrl(govPath(target), target.net)
    case 'pe':
      return explorerUrl(PE, target)
    case 'hyphen':
      return explorerUrl(HYPHEN, target)
    case 'insight':
      return explorerUrl(INSIGHT, target)
  }
}
