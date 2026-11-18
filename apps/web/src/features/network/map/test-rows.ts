import type { MnRow } from '@/data/masternodes/rows'
import type { RadarMasternode } from '@/data/radar/schemas'

/** A masternode row for the map's tests: crawled, answering, in Falkenstein at Hetzner unless told otherwise. */
export function row(
  protx: string,
  over: Partial<MnRow> = {},
  crawl: Partial<RadarMasternode> | null = {},
): MnRow {
  return {
    protx,
    type: 'regular',
    status: 'enabled',
    service: `${protx}.example:9999`,
    host: `${protx}.example`,
    registration: null,
    crawl:
      crawl === null
        ? null
        : ({
            reachable: true,
            version: '24.0.0',
            country: 'DE',
            city: 'Falkenstein',
            lat: 50.48,
            lon: 12.37,
            asn: 24940,
            as_org: 'Hetzner Online GmbH',
            dkg_readiness: { overall: 'pass', checks: {} },
            ...crawl,
          } as RadarMasternode),
    dapi: null,
    radar: null,
    ...over,
  }
}
