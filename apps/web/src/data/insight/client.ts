import type { z } from 'zod'
import type { NetworkId } from '@/lib/network'
import type { Sourced } from '../envelope'
import { healthRegistry } from '../health'
import { indexedLagDetail } from '../health-lag'
import { fetchSourced, requireEndpoint } from '../http'
import { txTip } from './adapt'
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

function get<S extends z.ZodType, N extends 'throw' | 'null' = 'throw'>(
  net: NetworkId,
  path: string,
  schema: S,
  opts: {
    signal?: AbortSignal
    notFound?: N
    height?: (body: z.output<S>) => number | undefined
  } = {},
) {
  return fetchSourced({
    source: 'insight',
    net,
    url: () => `${requireEndpoint(net, 'insight', 'insight')}${path}`,
    schema,
    ...opts,
  })
}

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
      const index = await get(net, `/block-index/${seg(hash)}`, InsBlockIndexSchema, {
        notFound: 'null',
        signal,
      })
      if (!index.data) return { ...index, data: null }
      hash = index.data.blockHash
    }
    return get(net, `/block/${seg(hash)}`, InsBlockSchema, {
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
    return get(net, `/tx/${seg(txid)}`, InsTxSchema, { notFound: 'null', signal, height: txTip })
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
