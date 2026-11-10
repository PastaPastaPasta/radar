import type { NetworkId } from '@/lib/network'
import { hyphen } from '@/data/hyphen/client'
import { hyQueries } from '@/data/hyphen/queries'
import { hyKeys } from '@/data/query/keys'
import { POLL_MS } from '@/data/query/stale'
import { cursorPages } from '../hy-shared/queries'

export const MEMPOOL_LIMIT = 20

export const mempoolQueries = {
  summary: hyQueries.mempool,
  txs: (net: NetworkId) =>
    cursorPages({
      key: hyKeys(net, 'mempool-txs-pages'),
      fetchPage: (cursor, signal) =>
        hyphen.mempoolTxs(net, { limit: MEMPOOL_LIMIT, cursor }, signal),
      dataClass: 'latest',
      refetchInterval: POLL_MS.mempool,
    }),
}
