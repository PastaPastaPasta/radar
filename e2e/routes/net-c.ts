import { M1_RECORDS, masternodeH1 } from './m1'
import { ROUTE_NETS } from './fixtures'
import type { RouteCase } from './types'

/** The masternode page is built already (see `m1.ts`); these are its tabs that M2 will fill in. */
export const netC: RouteCase[] = ROUTE_NETS.flatMap((net) =>
  ['network', 'platform', 'history'].map((tab): RouteCase => ({
    path: `/mn/${M1_RECORDS[net].protx}?tab=${tab}`,
    h1: masternodeH1(net),
    nets: [net],
    built: true,
    decentralized: 'unavailable',
  })),
)
