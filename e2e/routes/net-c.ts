import { M1_RECORDS, masternodeH1 } from './m1'
import { ROUTE_NETS } from './fixtures'
import type { RouteCase } from './types'

/**
 * The masternode page and its tabs. The page is built already; NET-C owns these cases, including their Decentralized
 * only expectation (the header still comes from DAPI there, so `partial` may fit better than `unavailable`).
 */
export const netC: RouteCase[] = ROUTE_NETS.flatMap((net) => {
  const protx = M1_RECORDS[net].protx
  const h1 = masternodeH1(net)
  return ['', '?tab=payments', '?tab=network', '?tab=platform', '?tab=history'].map(
    (query): RouteCase => ({
      path: `/mn/${protx}${query}`,
      h1,
      nets: [net],
      built: true,
      decentralized: 'unavailable',
    }),
  )
})
