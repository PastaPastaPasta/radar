import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { mapSourced, stampOf, type SourceStamp, type Sourced } from '../envelope'
import {
  BLOCK_MS,
  heightAt,
  measuredBlockMs,
  pastSuperblocks,
  superblockEta,
  type CycleTip,
  type GovernanceCycle,
  type PastSuperblock,
} from '../governance-cycle'
import type { HyPage, HyProposal } from '../hyphen/schemas'
import { insKeys } from '../query/keys'
import { dataClass } from '../query/stale'
import type { SuperblockBudget } from '../governance-budget'
import { adaptProposals } from './adapt'
import { readInsightPage } from './blocks-page'
import { insight } from './client'
import type { InsGovernanceInfo } from './schemas'

const lower = (s: string) => s.toLowerCase()

/**
 * The chain's tip from DAPI (never an index's stand-in), which superblock times are counted from, or undefined when it
 * can't be read. The browser's clock is no reference for a payment window.
 */
async function chainTip(
  net: NetworkId,
  signal: AbortSignal,
): Promise<{ tip: CycleTip; stamp: SourceStamp } | undefined> {
  const tip = await import('../core/client')
    .then((m) => m.core.tip(net, signal))
    .catch(() => undefined)
  if (!tip || tip.fallback) return undefined
  return {
    tip: { height: tip.data.height, time: tip.data.time, readAt: tip.fetchedAt },
    stamp: stampOf(tip),
  }
}

/** When the next superblock is due, from DAPI's tip at the block target, or undefined when either is missing. */
async function superblockTime(
  net: NetworkId,
  info: InsGovernanceInfo,
  signal: AbortSignal,
): Promise<number | undefined> {
  if (info.nextsuperblock == null) return undefined
  const tip = await chainTip(net, signal)
  return tip ? heightAt(tip.tip, info.nextsuperblock) : undefined
}

/** A governance cycle, with the stamps of DAPI's tip it was timed by and of Hyphen's past superblocks, when read. */
export type SourcedCycle = Sourced<GovernanceCycle> & {
  tipStamp?: SourceStamp
  pastStamp?: SourceStamp
}

/** How many past superblocks a cycle reads, to list them and to measure the chain's block rate. */
const PAST_SUPERBLOCKS = 3

/** The past superblocks' times from Hyphen; a block it can't give has no time. */
async function pastTimes(
  net: NetworkId,
  heights: number[],
  signal: AbortSignal,
): Promise<{ past: PastSuperblock[]; stamp?: SourceStamp }> {
  const { hyphen } = await import('../hyphen/client')
  const read = await Promise.all(
    heights.map((h) => hyphen.block(net, h, signal).catch(() => undefined)),
  )
  const first = read.find((r) => r?.data)
  return {
    past: heights.map((height, i) => ({ height, time: read[i]?.data?.blockTime })),
    ...(first ? { stamp: stampOf(first) } : {}),
  }
}

const toBudget = (s: SourcedCycle): Sourced<SuperblockBudget | null> =>
  mapSourced(s, (c) => {
    const at = superblockEta(c)
    return at === undefined ? null : { budget: c.budget, superblockAt: at }
  })

/** Dash Core's governance cycle through Insight (`getgovernanceinfo`), with DAPI's tip to time it. */
const governanceCycle = (net: NetworkId) =>
  queryOptions({
    queryKey: insKeys(net, 'governance-cycle'),
    queryFn: async ({ signal }): Promise<SourcedCycle> => {
      const info = await insight.governanceInfo(net, signal)
      const i = info.data
      const heights = pastSuperblocks(
        { lastSuperblock: i.lastsuperblock ?? null, cycleBlocks: i.superblockcycle ?? null },
        PAST_SUPERBLOCKS,
      )
      const [tip, times] = await Promise.all([
        i.nextsuperblock == null ? undefined : chainTip(net, signal),
        pastTimes(net, heights, signal),
      ])
      const measured = measuredBlockMs(times.past)
      return {
        ...mapSourced(info, (): GovernanceCycle => ({
          budget: i.governancebudget,
          nextSuperblock: i.nextsuperblock ?? null,
          lastSuperblock: i.lastsuperblock ?? null,
          cycleBlocks: i.superblockcycle ?? null,
          maturityBlocks: i.superblockmaturitywindow ?? null,
          tip: tip?.tip,
          past: times.past,
          blockMs: measured ?? BLOCK_MS,
          rateMeasured: measured !== undefined,
        })),
        ...(tip ? { tipStamp: tip.stamp } : {}),
        ...(times.stamp ? { pastStamp: times.stamp } : {}),
      }
    },
    ...dataClass('index'),
  })

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
  /**
   * A page of blocks `[top - count + 1, top]` joined from Insight's day lists into one contiguous run, with the block
   * times it needs from DAPI.
   */
  blocksPage: (net: NetworkId, q: { top: number; count: number }) =>
    queryOptions({
      queryKey: insKeys(net, 'blocks-page', q),
      queryFn: async ({ signal }) => {
        const { core } = await import('../core/client')
        const read = await readInsightPage(q.top, q.count, {
          timeAt: (height) => core.headers(net, height, 1, signal).then((h) => h.data[0]?.time),
          list: (list) => insight.blocks(net, list, signal),
        })
        if (!read) throw new Error('Insight has no block list for this page')
        return read
      },
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
  /**
   * What the next superblock can pay and when, from Dash Core's `getgovernanceinfo` through Insight; `null` when its
   * time can't be worked out. Hyphen has no budget, so its proposals are funded against this too.
   */
  superblockBudget: (net: NetworkId) => queryOptions({ ...governanceCycle(net), select: toBudget }),
  /** Dash Core's governance cycle through Insight (`getgovernanceinfo`), with DAPI's tip to time it. */
  governanceCycle,
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
