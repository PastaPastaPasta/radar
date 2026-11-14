import type { z } from 'zod'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { healthRegistry } from '../health'
import { indexedLagDetail } from '../health-lag'
import { INDEX_STALE_BLOCKS } from '../index-state'
import { fetchSourced, requireEndpoint } from '../http'
import {
  HyAddressSchema,
  HyAddressTxSchema,
  HyBalancesSchema,
  HyBlockDetailSchema,
  HyBlockSummarySchema,
  HyBlockTxSchema,
  HyMempoolSchema,
  HyMempoolTxSchema,
  HyMetricsChartSchema,
  HyMetricsSchema,
  HyNetworkSchema,
  HyProposalSchema,
  HyProposalVoteSchema,
  HyRawBlockSchema,
  HyRawTxSchema,
  HySearchSchema,
  HyStatusSchema,
  HyTxDetailSchema,
  HyUtxoSchema,
  HyValidatorDetailSchema,
  HyValidatorSchema,
  hyPage,
  type HyAddress,
  type HyAddressTx,
  type HyBalances,
  type HyBlockDetail,
  type HyBlockSummary,
  type HyBlockTx,
  type HyMempool,
  type HyMempoolTx,
  type HyMetrics,
  type HyMetricsChart,
  type HyNetwork,
  type HyPage,
  type HyProposal,
  type HyProposalVote,
  type HyRawBlock,
  type HyRawTx,
  type HySearch,
  type HyStatus,
  type HyTxDetail,
  type HyUtxo,
  type HyValidator,
  type HyValidatorDetail,
} from './schemas'
import { cursorFromHeight, type HyListQuery, type HyQueryParams } from './params'
import { openHyphenStream } from './stream'

function qs(q: HyQueryParams | undefined): string {
  if (!q) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined) sp.set(k, String(v))
  return sp.size ? `?${sp}` : ''
}

const seg = encodeURIComponent

function base(net: NetworkId): string {
  return requireEndpoint(net, 'hyphen', 'hyphen')
}

interface Heighted {
  asOfHeight?: number
}

function get<S extends z.ZodType>(net: NetworkId, path: string, schema: S, signal?: AbortSignal) {
  return fetchSourced({
    source: 'hyphen',
    net,
    url: () => `${base(net)}${path}`,
    schema,
    signal,
    height: (b: z.output<S>) => (b as Heighted).asOfHeight,
  })
}

function getOrNull<S extends z.ZodType>(
  net: NetworkId,
  path: string,
  schema: S,
  signal?: AbortSignal,
) {
  return fetchSourced({
    source: 'hyphen',
    net,
    url: () => `${base(net)}${path}`,
    schema,
    notFound: 'null',
    signal,
    height: (b: z.output<S>) => (b as Heighted).asOfHeight,
  })
}

function reportHyphenLag(
  net: NetworkId,
  status: HyStatus,
  referenceHeight: number | undefined,
): void {
  const indexed = Object.values(status.indices)
  if (indexed.length === 0) return
  const min = indexed.reduce((m, i) => Math.min(m, i.indexedHeight), Infinity)
  const oldest = indexed.reduce((m, i) => Math.min(m, i.updatedAt), Infinity)
  // Hyphen's own chain height is no proof that it is fresh, but a gap between it and its indexes is proof that it is not.
  const own = status.blockHeight - min > INDEX_STALE_BLOCKS ? status.blockHeight : undefined
  const reference =
    referenceHeight === undefined ? own : Math.max(referenceHeight, status.blockHeight)
  if (reference === undefined) return
  const behind = Math.max(0, reference - min)
  healthRegistry.setLag(net, 'hyphen', {
    blocks: behind,
    ms: behind > 0 ? Date.now() - oldest : undefined,
    detail: indexedLagDetail(min, behind, behind > 0 ? Date.now() - oldest : undefined),
  })
}

export const hyphen = {
  /** `referenceHeight`: the chain tip from a source outside Hyphen, to measure how far its index trails. */
  async status(
    net: NetworkId,
    signal?: AbortSignal,
    referenceHeight?: number,
  ): Promise<Sourced<HyStatus>> {
    const out = await fetchSourced({
      source: 'hyphen',
      net,
      url: () => `${base(net)}/status`,
      schema: HyStatusSchema,
      signal,
      height: (b) => {
        const heights = Object.values(b.indices).map((i) => i.indexedHeight)
        return heights.length > 0 ? Math.min(...heights) : undefined
      },
    })
    reportHyphenLag(net, out.data, referenceHeight)
    return out
  },

  blocks(
    net: NetworkId,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyBlockSummary>>> {
    return get(net, `/blocks${qs(q)}`, hyPage(HyBlockSummarySchema), signal)
  },

  /** A page of blocks counting down from `fromHeight`, with `asOfHeight` pinning the index snapshot. */
  blocksFrom(
    net: NetworkId,
    q: { fromHeight: number; asOfHeight: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyBlockSummary>>> {
    return hyphen.blocks(
      net,
      { limit: q.limit, cursor: cursorFromHeight(q.asOfHeight, q.fromHeight + 1) },
      signal,
    )
  },

  block(
    net: NetworkId,
    hashOrHeight: string | number,
    signal?: AbortSignal,
  ): Promise<Sourced<HyBlockDetail | null>> {
    return getOrNull(net, `/block/${seg(String(hashOrHeight))}`, HyBlockDetailSchema, signal)
  },

  blockTxs(
    net: NetworkId,
    hashOrHeight: string | number,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyBlockTx>>> {
    return get(
      net,
      `/block/${seg(String(hashOrHeight))}/txs${qs(q)}`,
      hyPage(HyBlockTxSchema),
      signal,
    )
  },

  rawBlock(
    net: NetworkId,
    hashOrHeight: string | number,
    signal?: AbortSignal,
  ): Promise<Sourced<HyRawBlock | null>> {
    return getOrNull(net, `/rawblock/${seg(String(hashOrHeight))}`, HyRawBlockSchema, signal)
  },

  tx(net: NetworkId, txid: string, signal?: AbortSignal): Promise<Sourced<HyTxDetail | null>> {
    return getOrNull(net, `/tx/${seg(txid)}`, HyTxDetailSchema, signal)
  },

  rawTx(net: NetworkId, txid: string, signal?: AbortSignal): Promise<Sourced<HyRawTx | null>> {
    return getOrNull(net, `/rawtx/${seg(txid)}`, HyRawTxSchema, signal)
  },

  address(
    net: NetworkId,
    address: string,
    signal?: AbortSignal,
  ): Promise<Sourced<HyAddress | null>> {
    return getOrNull(net, `/address/${seg(address)}`, HyAddressSchema, signal)
  },

  addressTxs(
    net: NetworkId,
    address: string,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyAddressTx>>> {
    return get(net, `/address/${seg(address)}/txs${qs(q)}`, hyPage(HyAddressTxSchema), signal)
  },

  addressUtxos(
    net: NetworkId,
    address: string,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyUtxo>>> {
    return get(net, `/address/${seg(address)}/utxos${qs(q)}`, hyPage(HyUtxoSchema), signal)
  },

  balances(
    net: NetworkId,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyBalances>> {
    return get(net, `/balances${qs(q)}`, HyBalancesSchema, signal)
  },

  metricsLatest(net: NetworkId, signal?: AbortSignal): Promise<Sourced<HyMetrics>> {
    return fetchSourced({
      source: 'hyphen',
      net,
      url: () => `${base(net)}/metrics/latest`,
      schema: HyMetricsSchema,
      signal,
      height: (b) => b.height,
    })
  },

  metricsChart(
    net: NetworkId,
    q: { blocks?: number; points?: number } = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyMetricsChart>> {
    return get(
      net,
      `/metrics/chart${qs({ blocks: q.blocks ?? 144, points: q.points ?? 144 })}`,
      HyMetricsChartSchema,
      signal,
    )
  },

  mempool(net: NetworkId, signal?: AbortSignal): Promise<Sourced<HyMempool>> {
    return get(net, '/mempool', HyMempoolSchema, signal)
  },

  mempoolTxs(
    net: NetworkId,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyMempoolTx>>> {
    return get(net, `/mempool/txs${qs(q)}`, hyPage(HyMempoolTxSchema), signal)
  },

  network(net: NetworkId, signal?: AbortSignal): Promise<Sourced<HyNetwork>> {
    return get(net, '/network', HyNetworkSchema, signal)
  },

  proposals(
    net: NetworkId,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyProposal>>> {
    return get(net, `/proposals${qs(q)}`, hyPage(HyProposalSchema), signal)
  },

  proposal(
    net: NetworkId,
    hash: string,
    signal?: AbortSignal,
  ): Promise<Sourced<HyProposal | null>> {
    return getOrNull(net, `/proposal/${seg(hash)}`, HyProposalSchema, signal)
  },

  proposalVotes(
    net: NetworkId,
    hash: string,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyProposalVote>>> {
    return get(net, `/proposal/${seg(hash)}/votes${qs(q)}`, hyPage(HyProposalVoteSchema), signal)
  },

  validators(
    net: NetworkId,
    q: HyListQuery = {},
    signal?: AbortSignal,
  ): Promise<Sourced<HyPage<HyValidator>>> {
    return get(net, `/validators${qs(q)}`, hyPage(HyValidatorSchema), signal)
  },

  validator(
    net: NetworkId,
    proTxHash: string,
    signal?: AbortSignal,
  ): Promise<Sourced<HyValidatorDetail | null>> {
    return getOrNull(net, `/validator/${seg(proTxHash)}`, HyValidatorDetailSchema, signal)
  },

  /** Hyphen needs 4+ characters (or a plain height) and returns at most 10 typed hits. */
  search(net: NetworkId, q: string, signal?: AbortSignal): Promise<Sourced<HySearch | null>> {
    return getOrNull(net, `/search${qs({ q })}`, HySearchSchema, signal)
  },

  stream: openHyphenStream,
}
