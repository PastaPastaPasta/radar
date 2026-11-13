import { isDevnet, type DevnetConfig, type NetworkId } from '@/lib/network'
import { decentralizedOnly } from '@/lib/source-mode'

export type EndpointSource = 'quorums' | 'radar' | 'pe' | 'hyphen' | 'insight' | 'rate'

const RADAR_BASE = 'https://radar.dashhq.org/api/v1'

const PE_BASE = {
  mainnet: 'https://api.pe.dashhq.org',
  testnet: 'https://api.testnet.pe.dashhq.org',
} as const

const INSIGHT_BASE = {
  mainnet: 'https://insight.dash.org/insight-api',
  testnet: 'https://insight.testnet.networks.dash.org/insight-api',
} as const

const DEVNET_NAME = /^devnet-(.+)$/

/**
 * Base URL for a source on a network, or null where the source isn't offered.
 * `devnets` supplies a devnet's configured `quorumUrl`.
 */
export function endpoint(
  net: NetworkId,
  source: EndpointSource,
  devnets: readonly DevnetConfig[] = [],
): string | null {
  switch (source) {
    case 'quorums':
      if (isDevnet(net)) {
        const name = DEVNET_NAME.exec(net)?.[1]
        if (!name) return null
        const configured = devnets.find((d) => d.name === name)?.quorumUrl?.trim()
        if (configured) return configured
        return `https://quorums.${name}.networks.dash.org`
      }
      return `https://quorums.${net}.networks.dash.org`
    case 'radar':
      return net === 'mainnet' || net === 'testnet' ? `${RADAR_BASE}/${net}` : null
    case 'pe':
      return net === 'mainnet' || net === 'testnet' ? PE_BASE[net] : null
    case 'hyphen':
      return net === 'mainnet' || net === 'testnet' ? `/x/hy/${net}` : null
    case 'insight':
      return net === 'mainnet' || net === 'testnet' ? INSIGHT_BASE[net] : null
    case 'rate':
      return net === 'mainnet' ? PE_BASE.mainnet : null
  }
}

/** Port used for a quorum-list entry without `platformHTTPPort`; null on devnets (from config). */
export function dapiDefaultPort(net: NetworkId): number | null {
  if (net === 'mainnet') return 443
  if (net === 'testnet') return 1443
  return null
}

/** Radar's network-independent endpoints (`/status`, `/health`, `/releases`). */
export const RADAR_GLOBAL_BASE = RADAR_BASE

/**
 * Sources served by one operator's hosted backend. Decentralized only mode contacts none of them: Hyphen (through the
 * edge's `/x/hy/*` pass-through), Insight, Platform Explorer and its `/rate` price, and the Radar census API.
 */
export const HOSTED_SOURCES = ['radar', 'pe', 'hyphen', 'insight', 'rate'] as const
export type HostedSource = (typeof HOSTED_SOURCES)[number]

export const isHostedSource = (source: string): source is HostedSource =>
  (HOSTED_SOURCES as readonly string[]).includes(source)

/** True while Decentralized only mode forbids every request to `source`. */
export const sourceOff = (source: string): boolean => isHostedSource(source) && decentralizedOnly()

/**
 * Whether `source` may be asked on `net` right now: it has an endpoint there and the mode allows it. Probes,
 * prefetches and loaders ask this before they start anything, so nothing even tries a source that is off.
 */
export const sourceInUse = (net: NetworkId, source: HostedSource): boolean =>
  endpoint(net, source) !== null && !sourceOff(source)
