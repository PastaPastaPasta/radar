import type { NetworkId } from '@/lib/network'
import { hyphen } from '@/data/hyphen/client'
import { hyQueries } from '@/data/hyphen/queries'
import { hyKeys } from '@/data/query/keys'
import { cursorPages } from '../hy-shared/queries'

export const RICH_LIMIT = 25
export const CONCENTRATION_ROWS = 100

export const richListQueries = {
  rows: (net: NetworkId) =>
    cursorPages({
      key: hyKeys(net, 'balances-pages'),
      fetchPage: (cursor, signal) => hyphen.balances(net, { limit: RICH_LIMIT, cursor }, signal),
    }),
  top: (net: NetworkId) => hyQueries.balances(net, { limit: CONCENTRATION_ROWS }),
}
