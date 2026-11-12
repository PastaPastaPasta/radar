import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { mapSourced } from '../envelope'
import type { HyPage, HyProposal } from '../hyphen/schemas'
import { insKeys } from '../query/keys'
import { dataClass } from '../query/stale'
import { adaptProposals } from './adapt'
import { insight } from './client'
import type { InsGovernanceInfo } from './schemas'

const lower = (s: string) => s.toLowerCase()

const BLOCK_MS = 150_000

/**
 * When the next superblock is due, from the chain's own tip (DAPI's, never an index's stand-in) and the 2.5 minute block
 * target, or undefined when either is missing. The browser's clock is no reference for a payment window.
 */
async function superblockTime(
  net: NetworkId,
  info: InsGovernanceInfo,
  signal: AbortSignal,
): Promise<number | undefined> {
  if (info.nextsuperblock == null) return undefined
  const tip = await import('../core/client')
    .then((m) => m.core.tip(net, signal))
    .catch(() => undefined)
  if (!tip || tip.fallback) return undefined
  return tip.data.time + (info.nextsuperblock - tip.data.height) * BLOCK_MS
}

/** Insight is a shared public service: its reads are cached like Hyphen's and never polled faster. */
export const insQueries = {
  block: (net: NetworkId, hashOrHeight: string | number) =>
    queryOptions({
      queryKey: insKeys(net, 'block', { id: lower(String(hashOrHeight)) }),
      queryFn: ({ signal }) => insight.block(net, hashOrHeight, signal),
      ...dataClass('index'),
    }),
  /** One page of a day's block list, in one request (§4.7). Times are ms. */
  blocks: (net: NetworkId, q: { date: string; limit: number; startTimestamp?: number }) =>
    queryOptions({
      queryKey: insKeys(net, 'blocks', q),
      queryFn: ({ signal }) => insight.blocks(net, q, signal),
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
      // The whole set comes in one answer: a new block refreshes it while the address page is open, a focus never does.
      refetchOnWindowFocus: false,
    }),
  tx: (net: NetworkId, txid: string) =>
    queryOptions({
      queryKey: insKeys(net, 'tx', { txid: lower(txid) }),
      queryFn: ({ signal }) => insight.tx(net, txid, signal),
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
        const at = await superblockTime(net, info.data, signal)
        return mapSourced(list, (items): HyPage<HyProposal> => ({
          items: adaptProposals(items, info.data, at),
        }))
      },
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
