import { t } from '@lingui/core/macro'
import type { NetworkId } from '@/lib/network'
import { getActiveNetwork } from '../active-network'
import { healthRegistry } from '../health'
import { humanizeSpan } from '../health-lag'
import { fetchSourced, lastModifiedMs, requireEndpoint } from '../http'
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
      detail: t`last crawl finished ${humanizeSpan(ms)} ago`,
    })
  }
}

const modified = (_body: unknown, res: Response) => lastModifiedMs(res)

function newest(times: Iterable<number | null | undefined>): number | undefined {
  let max: number | undefined
  for (const t of times) if (t != null && (max === undefined || t > max)) max = t
  return max
}

function healthCrawlTime(body: RadarHealth, res: Response, fetchedAt: number): number | undefined {
  const active = getActiveNetwork()
  const nets = active === 'mainnet' || active === 'testnet' ? [active] : ['mainnet', 'testnet']
  const ages = nets.map((n) => body.age_secs?.[n]?.crawl)
  const oldest =
    ages.includes(undefined) || ages.includes(null) ? undefined : Math.max(...(ages as number[]))
  return oldest === undefined ? lastModifiedMs(res) : fetchedAt - oldest * 1000
}

export const radar = {
  /**
   * Global document, read for one network (the active one by default): `net` picks the stamp and the
   * health record it reports to. The crawl lag is set for both networks. Radar offers no devnet.
   */
  async status(
    signal?: AbortSignal,
    net: NetworkId = getActiveNetwork(),
  ): Promise<Sourced<RadarStatus>> {
    const out = await fetchSourced({
      source: 'radar',
      net,
      url: () => {
        netBase(net)
        return `${RADAR_GLOBAL_BASE}/status`
      },
      schema: RadarStatusSchema,
      signal,
      asOf: (b) => b.networks[net === 'testnet' ? 'testnet' : 'mainnet'].chain.updated,
    })
    reportCrawlLag(out.data)
    return out
  },

  /** Global. Reported to the active network's health record. */
  health(signal?: AbortSignal): Promise<Sourced<RadarHealth>> {
    return fetchSourced({
      source: 'radar',
      url: `${RADAR_GLOBAL_BASE}/health`,
      schema: RadarHealthSchema,
      acceptStatus: [503],
      signal,
      asOf: healthCrawlTime,
    })
  },

  /** Global. Reported to the active network's health record. */
  releases(signal?: AbortSignal): Promise<Sourced<RadarReleases>> {
    return fetchSourced({
      source: 'radar',
      url: `${RADAR_GLOBAL_BASE}/releases`,
      schema: RadarReleasesSchema,
      signal,
      asOf: modified,
    })
  },

  summary(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarSummary>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: () => `${netBase(net)}/summary`,
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
      url: () => `${netBase(net)}/history?${params}`,
      schema: RadarHistorySchema,
      signal,
      asOf: modified,
    })
  },

  geo(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarGeo>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: () => `${netBase(net)}/geo`,
      schema: RadarGeoSchema,
      signal,
      asOf: modified,
    })
  },

  masternodes(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarMasternode[]>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: () => `${netBase(net)}/masternodes`,
      schema: RadarMasternodesSchema,
      signal,
      height: (b) => b.tip ?? undefined,
      asOf: (b, res) => newest(b.masternodes.map((m) => m.last_seen)) ?? lastModifiedMs(res),
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
      url: () => `${netBase(net)}/masternodes/${protxPath(protx)}`,
      schema: RadarMasternodeDetailSchema,
      notFound: 'null',
      signal,
      asOf: modified,
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
      url: () => `${netBase(net)}/masternodes/${protxPath(protx)}/payments${qs}`,
      schema: RadarPaymentsSchema,
      signal,
      asOf: modified,
    }).then((s) => mapSourced(s, (d) => d.payments))
  },

  bench(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarBench>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: () => `${netBase(net)}/bench`,
      schema: RadarBenchSchema,
      signal,
      asOf: (b, res) =>
        b.vantages.reduce((m, v) => Math.max(m, v.updated), 0) || lastModifiedMs(res),
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
      url: () => `${netBase(net)}/masternodes/${protxPath(protx)}/bench`,
      schema: RadarMnBenchSchema,
      notFound: 'null',
      signal,
      asOf: modified,
    })
  },

  platform(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarPlatform>> {
    return fetchSourced({
      source: 'radar',
      net,
      url: () => `${netBase(net)}/platform`,
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
      url: () => `${netBase(net)}/activation`,
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
      url: () => `${netBase(net)}/changes`,
      schema: RadarChangesSchema,
      signal,
      asOf: modified,
    })
  },

  /** Live P2P handshake against one masternode (testnet, port 19999 only). Radar rate-limits it. */
  check(net: NetworkId, protx: string, signal?: AbortSignal): Promise<Sourced<RadarCheck>> {
    return fetchSourced({
      source: 'radar',
      net,
      method: 'POST',
      url: () => `${netBase(net)}/masternodes/${protxPath(protx)}/check`,
      schema: RadarCheckSchema,
      signal,
      timeoutMs: 20_000,
      asOf: (b) => b.checked ?? undefined,
    })
  },
}
