import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { mapSourced } from '../envelope'
import type { HyPage, HyProposal } from '../hyphen/schemas'
import { insKeys } from '../query/keys'
import { dataClass } from '../query/stale'
import { adaptProposals } from './adapt'
import { insight } from './client'

const lower = (s: string) => s.toLowerCase()

/** Insight is a shared public service: its reads are cached like Hyphen's and never polled faster. */
export const insQueries = {
  status: (net: NetworkId) =>
    queryOptions({
      queryKey: insKeys(net, 'status'),
      queryFn: ({ signal }) => insight.status(net, signal),
      ...dataClass('index'),
    }),
  block: (net: NetworkId, hashOrHeight: string | number) =>
    queryOptions({
      queryKey: insKeys(net, 'block', { id: lower(String(hashOrHeight)) }),
      queryFn: ({ signal }) => insight.block(net, hashOrHeight, signal),
      ...dataClass('index'),
    }),
  address: (net: NetworkId, address: string) =>
    queryOptions({
      queryKey: insKeys(net, 'address', { address }),
      queryFn: ({ signal }) => insight.address(net, address, signal),
      ...dataClass('index'),
    }),
  addressTxs: (net: NetworkId, address: string, pageNum = 0) =>
    queryOptions({
      queryKey: insKeys(net, 'address-txs', { address, page: pageNum }),
      queryFn: ({ signal }) => insight.addressTxs(net, address, pageNum, signal),
      ...dataClass('index'),
    }),
  addressUtxos: (net: NetworkId, address: string) =>
    queryOptions({
      queryKey: insKeys(net, 'address-utxos', { address }),
      queryFn: ({ signal }) => insight.addressUtxos(net, address, signal),
      ...dataClass('index'),
    }),
  tx: (net: NetworkId, txid: string) =>
    queryOptions({
      queryKey: insKeys(net, 'tx', { txid: lower(txid) }),
      queryFn: ({ signal }) => insight.tx(net, txid, signal),
      ...dataClass('index'),
    }),
  proposals: (net: NetworkId) =>
    queryOptions({
      queryKey: insKeys(net, 'proposals'),
      queryFn: ({ signal }) => insight.proposals(net, signal),
      ...dataClass('index'),
    }),
  /** Every proposal in Hyphen's shape, with funding worked out from the vote counts and the budget (`adaptProposals`). */
  proposalPage: (net: NetworkId) =>
    queryOptions({
      queryKey: insKeys(net, 'proposal-page'),
      queryFn: async ({ signal }) => {
        const [list, info] = await Promise.all([
          insight.proposals(net, signal),
          insight.governanceInfo(net, signal),
        ])
        return mapSourced(list, (items): HyPage<HyProposal> => ({
          items: adaptProposals(items, info.data, Date.now()),
        }))
      },
      ...dataClass('index'),
    }),
  governanceInfo: (net: NetworkId) =>
    queryOptions({
      queryKey: insKeys(net, 'governance-info'),
      queryFn: ({ signal }) => insight.governanceInfo(net, signal),
      ...dataClass('index'),
    }),
}

/** Insight's address history is paged by number, 10 to a page, newest first. */
export const insPages = {
  addressTxs: (net: NetworkId, address: string) =>
    infiniteQueryOptions({
      queryKey: insKeys(net, 'address-txs-pages', { address }),
      queryFn: ({ pageParam, signal }) => insight.addressTxs(net, address, pageParam, signal),
      initialPageParam: 0,
      getNextPageParam: (last, _all, lastPage) =>
        lastPage + 1 < last.data.pagesTotal ? lastPage + 1 : undefined,
      ...dataClass('index'),
    }),
}
