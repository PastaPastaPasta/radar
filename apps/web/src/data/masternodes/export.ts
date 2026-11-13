import type { NetworkId } from '@/lib/network'
import type { CsvColumn } from './csv'
import type { MnRow } from './rows'

const nonNegative = (n: number | null | undefined): number | null =>
  n != null && n >= 0 ? n : null

/** Every column Radar's crawl adds to what DAPI lists, in the order of the table. */
const CRAWL_COLUMNS: CsvColumn<MnRow>[] = [
  { header: 'reachable', value: (r) => r.crawl?.reachable },
  { header: 'country', value: (r) => r.crawl?.country },
  { header: 'city', value: (r) => r.crawl?.city },
  { header: 'asn', value: (r) => r.crawl?.asn },
  { header: 'hosting', value: (r) => r.crawl?.as_org },
  { header: 'version', value: (r) => r.crawl?.version },
  { header: 'user_agent', value: (r) => r.crawl?.user_agent },
  { header: 'protocol', value: (r) => r.crawl?.protocol },
  { header: 'uptime_7d', value: (r) => r.crawl?.uptime_7d },
  { header: 'uptime_30d', value: (r) => r.crawl?.uptime_30d },
  { header: 'last_paid_height', value: (r) => nonNegative(r.crawl?.last_paid_height) },
  { header: 'registered_height', value: (r) => nonNegative(r.crawl?.registered_height) },
  { header: 'pose_penalty', value: (r) => r.crawl?.pose_penalty },
  { header: 'pose_ban_height', value: (r) => nonNegative(r.crawl?.pose_ban_height) },
  { header: 'payout_address', value: (r) => r.crawl?.payout_address },
  { header: 'dkg_readiness', value: (r) => r.crawl?.dkg_readiness?.overall },
  { header: 'platform_30d_credits', value: (r) => r.crawl?.platform?.d30?.toString() },
  { header: 'platform_next_block', value: (r) => r.crawl?.platform?.next },
]

/** What DAPI's list carries for every entry. */
const DAPI_COLUMNS: CsvColumn<MnRow>[] = [
  { header: 'protx', value: (r) => r.protx },
  { header: 'type', value: (r) => r.type },
  { header: 'status', value: (r) => r.status },
  { header: 'address', value: (r) => r.service },
  { header: 'operator_key', value: (r) => r.registration?.pubKeyOperator },
  { header: 'voting_address', value: (r) => r.registration?.votingAddress },
  { header: 'confirmed_hash', value: (r) => r.registration?.confirmedHash },
  {
    header: 'platform_node_id',
    value: (r) => r.registration?.platformNodeId ?? r.crawl?.platform_node_id,
  },
  { header: 'platform_http_port', value: (r) => r.registration?.platformHttpPort },
  { header: 'platform_p2p_port', value: (r) => r.registration?.platformP2pPort },
]

/** The export's columns: the crawl's are left out while no row has a crawl. */
export function mnCsvColumns(withCrawl: boolean): CsvColumn<MnRow>[] {
  return withCrawl ? [...DAPI_COLUMNS, ...CRAWL_COLUMNS] : DAPI_COLUMNS
}

export const mnCsvName = (net: NetworkId): string => `masternodes-${net}.csv`
