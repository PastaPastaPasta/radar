import type { NetworkId } from '@/lib/network'
import { healthRegistry } from '../health'
import { humanizeSpan } from '../health-lag'
import { requireEndpoint, fetchSourced } from '../http'
import { RADAR_GLOBAL_BASE } from '../endpoints'
import { mapSourced, type Sourced } from '../envelope'
import {
  RadarActivationSchema,
  RadarBenchSchema,
  RadarChangesSchema,
  RadarCheckSchema,
  RadarGeoSchema,
  RadarHealthSchema,
  RadarHistorySchema,
  RadarMasternodeDetailSchema,
  RadarMasternodesSchema,
  RadarMnBenchSchema,
  RadarPaymentsSchema,
  RadarPlatformSchema,
  RadarReleasesSchema,
  RadarStatusSchema,
  RadarSummarySchema,
  type RadarActivation,
  type RadarBench,
  type RadarChanges,
  type RadarCheck,
  type RadarGeo,
  type RadarHealth,
  type RadarHistory,
  type RadarHistoryQuery,
  type RadarMasternode,
  type RadarMasternodeDetail,
  type RadarMnBench,
  type RadarPayment,
  type RadarPlatform,
  type RadarReleases,
  type RadarStatus,
  type RadarSummary,
} from './schemas'

const PROTX = /^[0-9a-f]{64}$/i

function netBase(net: NetworkId): string {
  return requireEndpoint(net, 'radar', 'radar')
}

function protxPath(protx: string): string {
  return PROTX.test(protx) ? protx.toLowerCase() : encodeURIComponent(protx)
}

function reportCrawlLag(status: RadarStatus): void {
  const now = Date.now()
  for (const net of ['mainnet', 'testnet'] as const) {
    const finished = status.networks[net].crawl.last_finished
    if (finished === null) continue
    const ms = Math.max(0, now - finished)
    healthRegistry.setLag(net, 'radar', {
      ms,
      detail: `last crawl finished ${humanizeSpan(ms)} ago`,
    })
  }
}

export const radar = {
  /** Global, not per network. Reported to the mainnet health record; lag is set for both networks. */
  async status(signal?: AbortSignal): Promise<Sourced<RadarStatus>> {
    const out = await fetchSourced({
      source: 'radar',
      net: 'mainnet',
      url: `${RADAR_GLOBAL_BASE}/status`,
      schema: RadarStatusSchema,
      signal,
      asOf: (b) => Math.max(b.networks.mainnet.chain.updated, b.networks.testnet.chain.updated),
    })
    reportCrawlLag(out.data)
    return out
  },

  health(signal?: AbortSignal): Promise<Sourced<RadarHealth>> {
    return fetchSourced({
      source: 'radar',
      net: 'mainnet',
      url: `${RADAR_GLOBAL_BASE}/health`,
      schema: RadarHealthSchema,
      acceptStatus: [503],
      signal,
    })
  },

  releases(signal?: AbortSignal): Promise<Sourced<RadarReleases>> {
    return fetchSourced({
      source: 'radar',
      net: 'mainnet',
      url: `${RADAR_GLOBAL_BASE}/releases`,
      schema: RadarReleasesSchema,
      signal,
      asOf: (b) => b.releases.reduce((m, r) => Math.max(m, r.published), 0) || Date.now(),
    })
  },

  summary(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarSummary>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/summary`,
      schema: RadarSummarySchema,
      signal,
      asOf: (b) => b.crawl.finished,
      height: (b) => b.crawl.tip_height,
    })
  },

  history(
    net: NetworkId,
    q: RadarHistoryQuery,
    signal?: AbortSignal,
  ): Promise<Sourced<RadarHistory>> {
    const params = new URLSearchParams({
      dim: q.dim,
      scope: q.scope ?? 'all',
      days: String(q.days ?? 30),
    })
    if (q.top !== undefined) params.set('top', String(q.top))
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/history?${params}`,
      schema: RadarHistorySchema,
      signal,
      asOf: (b) => b.t[b.t.length - 1] ?? Date.now(),
    })
  },

  geo(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarGeo>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/geo`,
      schema: RadarGeoSchema,
      signal,
    })
  },

  masternodes(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarMasternode[]>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/masternodes`,
      schema: RadarMasternodesSchema,
      signal,
      height: (b) => b.tip ?? undefined,
      asOf: (_b, res) => {
        const lm = res.headers.get('last-modified')
        return lm ? Date.parse(lm) : Date.now()
      },
    }).then((s) => mapSourced(s, (d) => d.masternodes))
  },

  masternode(
    net: NetworkId,
    protx: string,
    signal?: AbortSignal,
  ): Promise<Sourced<RadarMasternodeDetail | null>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/masternodes/${protxPath(protx)}`,
      schema: RadarMasternodeDetailSchema,
      notFound: 'null',
      signal,
      asOf: (b) => b.last_seen ?? Date.now(),
    })
  },

  payments(
    net: NetworkId,
    protx: string,
    q: { before?: number; limit?: number } = {},
    signal?: AbortSignal,
  ): Promise<Sourced<RadarPayment[]>> {
    const params = new URLSearchParams()
    if (q.before !== undefined) params.set('before', String(q.before))
    if (q.limit !== undefined) params.set('limit', String(q.limit))
    const qs = params.size ? `?${params}` : ''
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/masternodes/${protxPath(protx)}/payments${qs}`,
      schema: RadarPaymentsSchema,
      signal,
    }).then((s) => mapSourced(s, (d) => d.payments))
  },

  bench(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarBench>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/bench`,
      schema: RadarBenchSchema,
      signal,
      asOf: (b) => b.vantages.reduce((m, v) => Math.max(m, v.updated), 0) || Date.now(),
    })
  },

  mnBench(
    net: NetworkId,
    protx: string,
    signal?: AbortSignal,
  ): Promise<Sourced<RadarMnBench | null>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/masternodes/${protxPath(protx)}/bench`,
      schema: RadarMnBenchSchema,
      notFound: 'null',
      signal,
    })
  },

  platform(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarPlatform>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/platform`,
      schema: RadarPlatformSchema,
      signal,
      asOf: (b) => b.now.updated,
      height: (b) => b.now.height,
    })
  },

  activation(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarActivation>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/activation`,
      schema: RadarActivationSchema,
      signal,
      asOf: (b) => b.updated,
      height: (b) => b.tip.height,
    })
  },

  changes(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarChanges>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: `${netBase(net)}/changes`,
      schema: RadarChangesSchema,
      signal,
      asOf: (b) => b.changes.reduce((m, c) => Math.max(m, c.ts), 0) || Date.now(),
    })
  },

  /** Live P2P handshake against one masternode (testnet, port 19999 only). Radar rate-limits it. */
  check(net: NetworkId, protx: string, signal?: AbortSignal): Promise<Sourced<RadarCheck>> {
    return fetchSourced({
      source: 'radar',
      net,
      method: 'POST',
      url: `${netBase(net)}/masternodes/${protxPath(protx)}/check`,
      schema: RadarCheckSchema,
      signal,
      timeoutMs: 20_000,
      asOf: (b) => b.checked ?? Date.now(),
    })
  },
}
