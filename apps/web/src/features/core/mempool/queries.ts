import type { NetworkId } from '@/lib/network'
import { hyPages } from '@/data/hyphen/pages'
import { hyQueries } from '@/data/hyphen/queries'

const MEMPOOL_LIMIT = 20

export const mempoolQueries = {
  summary: hyQueries.mempool,
  txs: (net: NetworkId) => hyPages.mempoolTxs(net, MEMPOOL_LIMIT),
}
