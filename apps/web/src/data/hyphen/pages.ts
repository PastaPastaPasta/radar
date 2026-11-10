import { infiniteQueryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { hyKeys } from '../query/keys'
import { dataClass, POLL_MS, type DataClass } from '../query/stale'
import { hyphen } from './client'

type HyKey = ReturnType<typeof hyKeys>

interface Paged {
  nextCursor?: string
}

/** Hyphen list pages chained by cursor: "Show more" fetches the next one and keeps the earlier pages. */
function cursorPages<T extends Paged>(opts: {
  key: HyKey
  fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<Sourced<T>>
  dataClass?: DataClass
  refetchInterval?: number
}) {
  return infiniteQueryOptions({
    queryKey: opts.key,
    queryFn: ({ pageParam, signal }) => opts.fetchPage(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Sourced<T>) => last.data.nextCursor,
    ...dataClass(opts.dataClass ?? 'index'),
    ...(opts.refetchInterval === undefined ? {} : { refetchInterval: opts.refetchInterval }),
  })
}

/** Infinite counterparts of the cursor-paged `hyQueries` lists. */
export const hyPages = {
  addressTxs: (net: NetworkId, address: string, limit: number) =>
    cursorPages({
      key: hyKeys(net, 'address-txs-pages', { address }),
      fetchPage: (cursor, signal) => hyphen.addressTxs(net, address, { limit, cursor }, signal),
    }),
  balances: (net: NetworkId, limit: number) =>
    cursorPages({
      key: hyKeys(net, 'balances-pages'),
      fetchPage: (cursor, signal) => hyphen.balances(net, { limit, cursor }, signal),
    }),
  mempoolTxs: (net: NetworkId, limit: number) =>
    cursorPages({
      key: hyKeys(net, 'mempool-txs-pages'),
      fetchPage: (cursor, signal) => hyphen.mempoolTxs(net, { limit, cursor }, signal),
      dataClass: 'latest',
      refetchInterval: POLL_MS.mempool,
    }),
  proposalVotes: (net: NetworkId, hash: string, limit: number) =>
    cursorPages({
      key: hyKeys(net, 'proposal-votes-pages', { hash: hash.toLowerCase() }),
      fetchPage: (cursor, signal) => hyphen.proposalVotes(net, hash, { limit, cursor }, signal),
    }),
}
