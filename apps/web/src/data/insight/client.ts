import type { z } from 'zod'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { healthRegistry } from '../health'
import { indexedLagDetail } from '../health-lag'
import { fetchSourced, requireEndpoint } from '../http'
import {
  InsAddressSchema,
  InsBlockIndexSchema,
  InsBlockSchema,
  InsGovernanceInfoSchema,
  InsProposalListSchema,
  InsStatusSchema,
  InsTxPageSchema,
  InsTxSchema,
  InsUtxoListSchema,
  type InsAddress,
  type InsBlock,
  type InsGovernanceInfo,
  type InsProposal,
  type InsStatus,
  type InsTx,
  type InsTxPage,
  type InsUtxo,
} from './schemas'

const seg = encodeURIComponent

function base(net: NetworkId): string {
  return requireEndpoint(net, 'insight', 'insight')
}

function get<S extends z.ZodType>(
  net: NetworkId,
  path: string,
  schema: S,
  opts: {
    signal?: AbortSignal
    height?: (body: z.output<S>) => number | undefined
  } = {},
) {
  return fetchSourced({
    source: 'insight',
    net,
    url: () => `${base(net)}${path}`,
    schema,
    signal: opts.signal,
    height: opts.height,
  })
}

/** The chain tip an answer about a confirmed transaction was read at: its height plus its confirmations, less one. */
const txTip = (tx: InsTx): number | undefined =>
  tx.blockheight != null && tx.blockheight >= 0 && tx.confirmations != null && tx.confirmations > 0
    ? tx.blockheight + tx.confirmations - 1
    : undefined

export const insight = {
  /** `referenceHeight`: the chain tip from a source outside Insight, to measure how far its index trails. */
  async status(
    net: NetworkId,
    signal?: AbortSignal,
    referenceHeight?: number,
  ): Promise<Sourced<InsStatus>> {
    const out = await get(net, '/status', InsStatusSchema, {
      signal,
      height: (b) => b.info.blocks,
    })
    if (referenceHeight !== undefined) {
      const behind = Math.max(0, referenceHeight - out.data.info.blocks)
      healthRegistry.setLag(net, 'insight', {
        blocks: behind,
        detail: indexedLagDetail(out.data.info.blocks, behind),
      })
    }
    return out
  },

  /** A block by hash, or by height (one more request: Insight resolves heights through `/block-index`). */
  async block(
    net: NetworkId,
    hashOrHeight: string | number,
    signal?: AbortSignal,
  ): Promise<Sourced<InsBlock | null>> {
    let hash = String(hashOrHeight)
    if (typeof hashOrHeight === 'number' || /^\d+$/.test(hash)) {
      const index = await fetchSourced({
        source: 'insight',
        net,
        url: () => `${base(net)}/block-index/${seg(hash)}`,
        schema: InsBlockIndexSchema,
        notFound: 'null',
        signal,
      })
      if (!index.data) return { ...index, data: null }
      hash = index.data.blockHash
    }
    return fetchSourced({
      source: 'insight',
      net,
      url: () => `${base(net)}/block/${seg(hash)}`,
      schema: InsBlockSchema,
      notFound: 'null',
      signal,
      height: (b) => b.height,
    })
  },

  address(net: NetworkId, address: string, signal?: AbortSignal): Promise<Sourced<InsAddress>> {
    return get(net, `/addr/${seg(address)}?noTxList=1`, InsAddressSchema, { signal })
  },

  /** One page (10 transactions, newest first; `pageNum` counts from 0). */
  addressTxs(
    net: NetworkId,
    address: string,
    pageNum: number,
    signal?: AbortSignal,
  ): Promise<Sourced<InsTxPage>> {
    return get(net, `/txs?address=${seg(address)}&pageNum=${pageNum}`, InsTxPageSchema, { signal })
  },

  addressUtxos(net: NetworkId, address: string, signal?: AbortSignal): Promise<Sourced<InsUtxo[]>> {
    return get(net, `/addr/${seg(address)}/utxo`, InsUtxoListSchema, { signal })
  },

  tx(net: NetworkId, txid: string, signal?: AbortSignal): Promise<Sourced<InsTx | null>> {
    return fetchSourced({
      source: 'insight',
      net,
      url: () => `${base(net)}/tx/${seg(txid)}`,
      schema: InsTxSchema,
      notFound: 'null',
      signal,
      height: txTip,
    })
  },

  proposals(net: NetworkId, signal?: AbortSignal): Promise<Sourced<InsProposal[]>> {
    return get(net, '/gobject/list', InsProposalListSchema, { signal })
  },

  governanceInfo(net: NetworkId, signal?: AbortSignal): Promise<Sourced<InsGovernanceInfo>> {
    return get(net, '/gobject/info', InsGovernanceInfoSchema, { signal }).then((s) => ({
      ...s,
      data: s.data.result,
    }))
  },
}
