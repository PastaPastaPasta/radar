import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { core } from '../core/client'
import type { DapiMnEntry } from '../core/types'
import type { SourceStamp, Sourced } from '../envelope'
import { stampOf } from '../envelope'
import { sourceOff } from '../endpoints'
import { disabledByMode, isDisabledByMode } from '../errors'
import { dataClass, viewKeys } from '../query'
import { radarQueries } from '../radar/queries'
import type { RadarMasternode, RadarMasternodes } from '../radar/schemas'

export type MnType = 'regular' | 'evo'
export type MnStatus = 'enabled' | 'pose-banned'

/** What a masternode's registration says, from DAPI's deterministic list. */
export interface MnRegistration {
  confirmedHash: string
  pubKeyOperator: string
  votingAddress: string
  platformHttpPort?: number
  platformP2pPort?: number
  platformNodeId?: string
}

/**
 * One masternode, joined from DAPI's list and Radar's crawl (rule 6). Type, status, service and the registration come
 * from DAPI whenever it answered; the crawl adds what only a crawler sees (reachability, version, location, DKG).
 */
export interface MnRow {
  protx: string
  type: MnType
  status: MnStatus
  service: string | null
  /** `service` without its port. */
  host: string | null
  registration: MnRegistration | null
  crawl: RadarMasternode | null
  /** The stamp of each part this row was built from: no part, no stamp. */
  dapi: SourceStamp | null
  radar: SourceStamp | null
  /** The crawl's copy of a field DAPI wins on (type, status, service, Platform node ID) is different. */
  crawlDiffers?: true
}

export interface MnRows {
  rows: MnRow[]
  dapi: SourceStamp | null
  radar: SourceStamp | null
}

const typeOf = (m: RadarMasternode): MnType => (m.type === 'Evo' ? 'evo' : 'regular')
const statusOf = (m: RadarMasternode): MnStatus =>
  m.status === 'enabled' ? 'enabled' : 'pose-banned'

const hostOf = (service: string | null): string | null =>
  service ? service.replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1') : null

function fromDapi(protx: string, e: DapiMnEntry, dapi: SourceStamp): MnRow {
  const service = e.service || null
  return {
    protx,
    type: e.type === 1 ? 'evo' : 'regular',
    status: e.isValid ? 'enabled' : 'pose-banned',
    service,
    host: hostOf(service),
    registration: {
      confirmedHash: e.confirmedHash,
      pubKeyOperator: e.pubKeyOperator,
      votingAddress: e.votingAddress,
      ...(e.platformHttpPort !== undefined && { platformHttpPort: e.platformHttpPort }),
      ...(e.platformP2pPort !== undefined && { platformP2pPort: e.platformP2pPort }),
      ...(e.platformNodeId !== undefined && { platformNodeId: e.platformNodeId }),
    },
    crawl: null,
    dapi,
    radar: null,
  }
}

function fromRadar(m: RadarMasternode, radarStamp: SourceStamp): MnRow {
  return {
    protx: m.protx,
    type: typeOf(m),
    status: statusOf(m),
    service: m.service,
    host: hostOf(m.service),
    registration: null,
    crawl: m,
    dapi: null,
    radar: radarStamp,
  }
}

function differs(row: MnRow, m: RadarMasternode): boolean {
  const nodeId = row.registration?.platformNodeId
  return (
    row.type !== typeOf(m) ||
    row.status !== statusOf(m) ||
    (m.service !== null && row.service !== null && m.service !== row.service) ||
    (nodeId !== undefined && m.platform_node_id !== null && m.platform_node_id !== nodeId)
  )
}

/**
 * Joins the two lists by ProTx hash. With DAPI's list, its masternodes are the rows and the crawl is attached to each
 * it knows; a crawled node DAPI no longer lists is not a masternode and is dropped. Without it, the crawl's rows
 * stand alone, stamped as Radar's. Both parts missing is the caller's error to raise.
 */
export function joinMnRows(
  crawl: Sourced<RadarMasternodes['masternodes']> | undefined,
  list: Sourced<Map<string, DapiMnEntry>> | undefined,
): Sourced<MnRows> | undefined {
  const radarStamp = crawl ? stampOf(crawl) : null
  const dapiStamp = list ? stampOf(list) : null
  const stamp = dapiStamp ?? radarStamp
  if (!stamp) return undefined
  const crawled = new Map(crawl?.data.map((m) => [m.protx, m]))
  const rows: MnRow[] = list
    ? [...list.data].map(([protx, entry]) => {
        const row = fromDapi(protx, entry, dapiStamp!)
        const seen = crawled.get(protx)
        if (!seen || !radarStamp) return row
        return {
          ...row,
          crawl: seen,
          radar: radarStamp,
          ...(differs(row, seen) && { crawlDiffers: true as const }),
        }
      })
    : crawl!.data.map((m) => fromRadar(m, radarStamp!))
  return { ...stamp, data: { rows, dapi: dapiStamp, radar: radarStamp } }
}

/**
 * The joined masternode list. Radar refused by Decentralized only mode, or down, leaves DAPI-only rows; DAPI down
 * leaves Radar-only rows. Both failing throws DAPI's error when the mode refused Radar (the mode is not an outage),
 * and Radar's otherwise.
 */
export const mnRowsQuery = (net: NetworkId) =>
  queryOptions({
    queryKey: viewKeys(net, 'mn-rows'),
    queryFn: async ({ signal, client }): Promise<Sourced<MnRows>> => {
      const [crawl, list] = await Promise.allSettled([
        sourceOff('radar')
          ? Promise.reject(disabledByMode('radar'))
          : client.ensureQueryData({ ...radarQueries.masternodes(net), revalidateIfStale: true }),
        core.masternodeList(net, signal),
      ])
      const joined = joinMnRows(
        crawl.status === 'fulfilled' ? crawl.value : undefined,
        list.status === 'fulfilled' ? list.value : undefined,
      )
      if (joined) return joined
      const failure = (crawl as PromiseRejectedResult).reason as unknown
      throw isDisabledByMode(failure) ? (list as PromiseRejectedResult).reason : failure
    },
    ...dataClass('index'),
  })
