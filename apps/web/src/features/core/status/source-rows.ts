import type { SourceId } from '@/data/envelope'
import type { SourceHealth } from '@/data/health'
import { endpoint, isHostedSource } from '@/data/endpoints'
import type { NetworkId } from '@/lib/network'

const STATUS_SOURCES: readonly SourceId[] = [
  'dapi',
  'sdk',
  'radar',
  'pe',
  'hyphen',
  'insight',
  'rate',
]

export interface SourceRow {
  source: SourceId
  /** False where the network has no such source (devnets have no Radar, PE, Hyphen or price). */
  offered: boolean
  /** Decentralized only mode keeps this source off: it is not probed, and it has no health to report. */
  off: boolean
  health: SourceHealth
}

/** Which sources a network offers: DAPI and the SDK everywhere, the rest on mainnet and testnet (rate: mainnet). */
export function offers(net: NetworkId, source: SourceId): boolean {
  switch (source) {
    case 'radar':
    case 'pe':
    case 'hyphen':
    case 'insight':
    case 'rate':
      return endpoint(net, source) !== null
    default:
      return true
  }
}

export function sourceRows(
  net: NetworkId,
  health: readonly SourceHealth[],
  decentralizedOnly = false,
): SourceRow[] {
  return STATUS_SOURCES.map((source) => ({
    source,
    offered: offers(net, source),
    off: decentralizedOnly && isHostedSource(source),
    health: health.find((h) => h.source === source) ?? { source, net, state: 'unknown' },
  }))
}

type Overall = 'ok' | 'attention' | 'down' | 'checking'

/** The banner: any source in use that is down is `down`, any stale, degraded or slow one is `attention`. */
export function overallState(rows: readonly SourceRow[]): Overall {
  const offered = rows.filter((r) => r.offered && !r.off)
  if (offered.some((r) => r.health.state === 'down')) return 'down'
  if (offered.some((r) => ['stale', 'degraded', 'slow'].includes(r.health.state)))
    return 'attention'
  if (offered.every((r) => r.health.state === 'unknown')) return 'checking'
  return 'ok'
}
