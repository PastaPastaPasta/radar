import type { NetworkId } from '@/lib/network'
import { hyPages } from '@/data/hyphen/pages'
import { hyQueries } from '@/data/hyphen/queries'

const RICH_LIMIT = 25
const CONCENTRATION_ROWS = 100

export const richListQueries = {
  rows: (net: NetworkId) => hyPages.balances(net, RICH_LIMIT),
  top: (net: NetworkId) => hyQueries.balances(net, { limit: CONCENTRATION_ROWS }),
}
