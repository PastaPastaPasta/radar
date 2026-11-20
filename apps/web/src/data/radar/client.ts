import { t } from '@lingui/core/macro'
import type { NetworkId } from '@/lib/network'
import { getActiveNetwork } from '../active-network'
import { healthRegistry } from '../health'
import { humanizeSpan } from '../health-lag'
import { fetchSourced, lastModifiedMs, requireEndpoint } from '../http'
import { RADAR_GLOBAL_BASE } from '../endpoints'
import { mapSourced, type Sourced } from '../envelope'
import { announceNewerCrawl } from './crawl-events'
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

interface Crawl {
  id: number | null
  finished: number
  /** When a document last told us about the latest crawl. */
  checkedAt: number
}

/** A crawl starts every 15 minutes (dash-nodes' `CRAWL_INTERVAL`); a crawl time not confirmed for this long is asked for again. */
const CRAWL_RECHECK_MS = 5 * 60_000

/** How many finished crawls per network keep their finish time, so a document of a recent crawl is dated by it. */
const KNOWN_CRAWLS = 16

/** The newest crawl each network's documents have named: every crawl-derived stamp carries its finish time. */
const crawls = new Map<NetworkId, Crawl>()
/** The finish time of each recent crawl, by id. */
const finishedById = new Map<NetworkId, Map<number, number>>()
const crawlReads = new Map<NetworkId, Promise<void>>()

/** Forgets every crawl time, so the next document asks Radar's status again. */
export function forgetCrawls(): void {
  crawls.clear()
  finishedById.clear()
}

function noteCrawl(net: NetworkId, id: number | null | undefined, finished: number | null): void {
  if (finished === null) return
  if (id != null) {
    const known = finishedById.get(net) ?? new Map<number, number>()
    known.set(id, finished)
    for (const old of [...known.keys()].sort((a, b) => a - b).slice(0, -KNOWN_CRAWLS)) {
      known.delete(old)
    }
    finishedById.set(net, known)
  }
  const had = crawls.get(net)
  const checkedAt = Date.now()
  if (!had || finished >= had.finished) crawls.set(net, { id: id ?? null, finished, checkedAt })
  else had.checkedAt = checkedAt
  if (had && finished > had.finished) announceNewerCrawl(net, finished)
}

/**
 * The finish time of `net`'s latest crawl. Radar's status says it when no document has, none has for a while, or a
 * document names a crawl newer than the latest one known; one read serves them all.
 * The read is not tied to a caller's signal: one query unmounting must not cancel the time the others are waiting on.
 */
async function crawlOf(net: NetworkId, force = false): Promise<Crawl | undefined> {
  const had = crawls.get(net)
  if (force || !had || Date.now() - had.checkedAt > CRAWL_RECHECK_MS) {
    let read = crawlReads.get(net)
    if (!read) {
      read = radar.status(undefined, net).then(
        () => undefined,
        () => undefined,
      )
      crawlReads.set(net, read)
      void read.finally(() => crawlReads.delete(net))
    }
    await read
  }
  return crawls.get(net)
}

/**
 * Where a crawl-derived document's time comes from, so every "Crawled by Radar" age on every page counts from the same
 * moment: the finish of the crawl the document names, or of the latest crawl when it names none. A document of an
 * earlier crawl than the latest says so (`radarTime: 'earlier-crawl'`); when Radar no longer says when that crawl
 * finished, the document keeps its own time.
 */
async function crawlTime(
  net: NetworkId,
  id: number | null | undefined,
  known: Crawl | undefined,
): Promise<{ asOf: number; radarTime: 'crawl' | 'earlier-crawl' } | undefined> {
  const latest = id != null && known?.id != null && id > known.id ? await crawlOf(net, true) : known
  if (!latest) return undefined
  if (id == null || latest.id === null || id === latest.id) {
    return { asOf: latest.finished, radarTime: 'crawl' }
  }
  const finished = finishedById.get(net)?.get(id)
  if (finished !== undefined) {
    return { asOf: finished, radarTime: id < latest.id ? 'earlier-crawl' : 'crawl' }
  }
  return undefined
}

/**
 * Stamps a document built from the crawl with the crawl's finish time rather than with the time it was fetched. A
 * document that names its crawl (`id`) takes that crawl's time. Radar's status is asked alongside the document, not
 * after it, so a cold page waits for one round trip; it is asked again only when the document names a newer crawl.
 */
async function stampedByCrawl<T>(
  net: NetworkId,
  read: Promise<Sourced<T>>,
  crawlId?: (data: T) => number | null | undefined,
): Promise<Sourced<T>> {
  const [out, known] = await Promise.all([read, crawlOf(net)])
  const id = crawlId?.(out.data)
  // Another document may have named a newer crawl while this one was in flight.
  const time = await crawlTime(net, id, crawls.get(net) ?? known)
  if (!time) {
    const latest = crawls.get(net)
    const earlier = id != null && latest?.id != null && id < latest.id
    return { ...out, radarTime: earlier ? 'earlier-crawl' : 'crawl' }
  }
  const { asOfFetched, ...rest } = out
  void asOfFetched
  return { ...rest, ...time }
}

/** Radar's own readings outside the crawl (its Platform checks, the activation count, benchmarks) keep their own time. */
const reading = <T>(out: Sourced<T>): Sourced<T> => ({ ...out, radarTime: 'reading' })

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
    opts: { probe?: boolean } = {},
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
      probe: opts.probe,
      asOf: (b) => {
        const { crawl, chain } = b.networks[net === 'testnet' ? 'testnet' : 'mainnet']
        return crawl.last_finished ?? chain.updated
      },
    })
    reportCrawlLag(out.data)
    for (const n of ['mainnet', 'testnet'] as const) {
      const crawl = out.data.networks[n].crawl
      noteCrawl(n, crawl.last_id, crawl.last_finished)
    }
    const crawled = out.data.networks[net === 'testnet' ? 'testnet' : 'mainnet'].crawl.last_finished
    return { ...out, radarTime: crawled === null ? 'reading' : 'crawl' }
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

  async summary(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarSummary>> {
    // Radar's status is read alongside on a cold page, so a summary of an older crawl is not taken for the latest.
    const [out] = await Promise.all([
      fetchSourced({
        source: 'radar',
        net,
        url: () => `${netBase(net)}/summary`,
        schema: RadarSummarySchema,
        signal,
        asOf: (b) => b.crawl.finished,
        height: (b) => b.crawl.tip_height,
      }),
      crawlOf(net),
    ])
    noteCrawl(net, out.data.crawl.id, out.data.crawl.finished)
    const latest = crawls.get(net)
    const earlier = latest?.id != null && out.data.crawl.id < latest.id
    return { ...out, radarTime: earlier ? 'earlier-crawl' : 'crawl' }
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
    return stampedByCrawl(
      net,
      fetchSourced({
        source: 'radar',
        net,
        url: () => `${netBase(net)}/history?${params}`,
        schema: RadarHistorySchema,
        signal,
        asOf: modified,
      }),
    )
  },

  geo(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarGeo>> {
    return stampedByCrawl(
      net,
      fetchSourced({
        source: 'radar',
        net,
        url: () => `${netBase(net)}/geo`,
        schema: RadarGeoSchema,
        signal,
        asOf: modified,
      }),
      (d) => d.crawl_id,
    )
  },

  masternodes(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarMasternode[]>> {
    return stampedByCrawl(
      net,
      fetchSourced({
        source: 'radar',
        net,
        url: () => `${netBase(net)}/masternodes`,
        schema: RadarMasternodesSchema,
        signal,
        height: (b) => b.tip ?? undefined,
        asOf: (b, res) => newest(b.masternodes.map((m) => m.last_seen)) ?? lastModifiedMs(res),
      }),
      (d) => d.crawl_id,
    ).then((s) => mapSourced(s, (d) => d.masternodes))
  },

  masternode(
    net: NetworkId,
    protx: string,
    signal?: AbortSignal,
  ): Promise<Sourced<RadarMasternodeDetail | null>> {
    return stampedByCrawl(
      net,
      fetchSourced({
        source: 'radar',
        net,
        url: () => `${netBase(net)}/masternodes/${protxPath(protx)}`,
        schema: RadarMasternodeDetailSchema,
        notFound: 'null',
        signal,
        asOf: modified,
      }),
    )
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
    }).then(reading)
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
    }).then(reading)
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
      heightChain: 'platform',
    }).then(reading)
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
    }).then(reading)
  },

  changes(net: NetworkId, signal?: AbortSignal): Promise<Sourced<RadarChanges>> {
    return stampedByCrawl(
      net,
      fetchSourced({
        source: 'radar',
        net,
        url: () => `${netBase(net)}/changes`,
        schema: RadarChangesSchema,
        signal,
        asOf: modified,
      }),
    )
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
    }).then(reading)
  },
}
