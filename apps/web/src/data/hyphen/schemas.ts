import { z } from 'zod'
import type { Page } from '../page'
import { zBigint, zHex, zHex64, zIsoDate, zUnixSeconds } from '../zod'

const CHAIN_HASH = zHex64

/** Hyphen sends `null` for a transaction page it cached while the transaction was still in the mempool. */
const zAsOfHeight = z
  .number()
  .nullish()
  .transform((v) => v ?? undefined)
  .optional()

export const HyStatusSchema = z.object({
  syncStatus: z.string(),
  syncMode: z.string().nullish(),
  blockHeight: z.number(),
  indices: z.record(z.string(), z.object({ indexedHeight: z.number(), updatedAt: zIsoDate })),
  version: z.string().nullish(),
})
export type HyStatus = z.output<typeof HyStatusSchema>

export function hyPage<T extends z.ZodType>(item: T) {
  return z
    .object({
      asOfHeight: zAsOfHeight,
      totalCount: z.number().nullish(),
      value: z.array(item),
      nextCursor: z.string().nullish(),
    })
    .transform((v): Page<z.output<T>> & { asOfHeight?: number } => ({
      items: v.value,
      total: v.totalCount ?? undefined,
      nextCursor: v.nextCursor ?? undefined,
      asOfHeight: v.asOfHeight,
    }))
}
export type HyPage<T> = Page<T> & { asOfHeight?: number }

const BlockTagsSchema = z.object({ orphan: z.boolean().nullish() })
const BlockLiveSchema = z
  .object({
    tags: z.object({ chainlock: z.boolean().nullish() }).nullish(),
    coreHeight: z.number().nullish(),
    seenAt: zIsoDate.nullish(),
  })
  .nullish()

export const HyBlockSummarySchema = z.object({
  blockHeight: z.number(),
  blockHash: CHAIN_HASH,
  prevBlockHash: CHAIN_HASH,
  blockTime: zIsoDate,
  bits: z.string(),
  nonce: z.number(),
  blockVersion: z.number(),
  blockSize: z.number(),
  txCount: z.number(),
  tags: BlockTagsSchema.nullish(),
  live: BlockLiveSchema,
})
export type HyBlockSummary = z.output<typeof HyBlockSummarySchema>

export const HyBlockDetailSchema = HyBlockSummarySchema.extend({
  asOfHeight: zAsOfHeight,
  merkle: CHAIN_HASH,
  status: z.string().nullish(),
  chainwork: z.string().nullish(),
  orphanedAt: zIsoDate.nullish(),
  cbTx: z
    .object({
      height: z.number(),
      merkleRootMnList: CHAIN_HASH,
      merkleRootQuorums: CHAIN_HASH.nullish(),
      merkleFlags: z.number().nullish(),
      bestClHeight: z.number().nullish(),
      bestClSignature: zHex.nullish(),
      creditPoolBalance: zBigint.nullish(),
    })
    .nullish(),
})
export type HyBlockDetail = z.output<typeof HyBlockDetailSchema>

const TxTagsSchema = z.object({ mined: z.boolean().nullish(), coinbase: z.boolean().nullish() })

export const HyBlockTxSchema = z.object({
  txHash: CHAIN_HASH,
  blockHeight: z.number(),
  blockPos: z.number(),
  txVersion: z.number(),
  txType: z.string(),
  lockTime: z.number().nullish(),
  txSize: z.number(),
  valueOut: zBigint,
  inputCount: z.number(),
  outputCount: z.number(),
  tags: TxTagsSchema.nullish(),
})
export type HyBlockTx = z.output<typeof HyBlockTxSchema>

export const HyRawBlockSchema = z.object({
  asOfHeight: zAsOfHeight,
  source: z.string(),
  rawblock: zHex,
})
export type HyRawBlock = z.output<typeof HyRawBlockSchema>

export const HyTxInputSchema = z.object({
  n: z.number(),
  scriptSig: z.object({ hex: zHex }).nullish(),
  sequence: z.number(),
  coinbase: zHex.nullish(),
  address: z.string().nullish(),
  value: zBigint.nullish(),
  txHash: CHAIN_HASH.nullish(),
  vout: z.number().nullish(),
})

export const HyTxOutputSchema = z.object({
  n: z.number(),
  value: zBigint,
  scriptPubKey: z.object({ hex: zHex }),
  address: z.string().nullish(),
  spent: z.boolean().nullish(),
})

export const HyTxDetailSchema = z.object({
  asOfHeight: zAsOfHeight,
  txHash: CHAIN_HASH,
  blockHeight: z.number().nullish(),
  blockPos: z.number().nullish(),
  txVersion: z.number(),
  txType: z.string(),
  lockTime: z.number().nullish(),
  txSize: z.number(),
  valueOut: zBigint,
  inputCount: z.number(),
  outputCount: z.number(),
  fee: zBigint.nullish(),
  tags: TxTagsSchema.nullish(),
  live: z
    .object({
      tags: z.object({ mempool: z.boolean().nullish(), islock: z.boolean().nullish() }).nullish(),
    })
    .nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
  vin: z.array(HyTxInputSchema),
  vout: z.array(HyTxOutputSchema),
})
export type HyTxDetail = z.output<typeof HyTxDetailSchema>

export const HyRawTxSchema = z.object({
  asOfHeight: zAsOfHeight,
  source: z.string(),
  rawtx: zHex,
})
export type HyRawTx = z.output<typeof HyRawTxSchema>

export const HyAddressSchema = z.object({
  asOfHeight: zAsOfHeight,
  address: z.string(),
  balance: zBigint,
  totalReceived: zBigint,
  totalSent: zBigint,
  txCount: z.number(),
  firstSeen: zIsoDate.nullish(),
  lastSeen: zIsoDate.nullish(),
})
export type HyAddress = z.output<typeof HyAddressSchema>

export const HyAddressTxSchema = z.object({
  txHash: CHAIN_HASH,
  blockHeight: z.number(),
  blockPos: z.number().nullish(),
  blockTime: zIsoDate,
  txVersion: z.number().nullish(),
  txType: z.string(),
  txSize: z.number().nullish(),
  valueOut: zBigint,
  netValue: zBigint,
  direction: z.enum(['in', 'out']),
  fee: zBigint.nullish(),
  tags: TxTagsSchema.nullish(),
})
export type HyAddressTx = z.output<typeof HyAddressTxSchema>

export const HyUtxoSchema = z.object({
  txHash: CHAIN_HASH,
  vout: z.number(),
  value: zBigint,
  /** Absent while the output is unconfirmed: Hyphen lists mined outputs only, Insight lists mempool ones too. */
  height: z.number().nullish(),
  scriptPubKey: zHex,
})
export type HyUtxo = z.output<typeof HyUtxoSchema>

export const HyRichRowSchema = z.object({
  rank: z.number(),
  address: z.string(),
  balance: zBigint,
  pctSupply: z.number(),
  totalReceived: zBigint,
  totalSent: zBigint,
  txCount: z.number(),
})
export type HyRichRow = z.output<typeof HyRichRowSchema>

export const HyBalancesSchema = z
  .object({
    asOfHeight: zAsOfHeight,
    totalCount: z.number().nullish(),
    positiveBalanceCount: z.number().nullish(),
    value: z.array(HyRichRowSchema),
    meta: z.object({ includedSupply: zBigint, supplyDefinition: z.string().nullish() }).nullish(),
    nextCursor: z.string().nullish(),
  })
  .transform((v) => ({
    items: v.value,
    total: v.totalCount ?? undefined,
    positiveBalanceCount: v.positiveBalanceCount ?? undefined,
    includedSupply: v.meta?.includedSupply,
    supplyDefinition: v.meta?.supplyDefinition ?? undefined,
    nextCursor: v.nextCursor ?? undefined,
    asOfHeight: v.asOfHeight,
  }))
export type HyBalances = z.output<typeof HyBalancesSchema>

export const HyMetricsSchema = z.object({
  height: z.number(),
  txCount: z.number(),
  utxosSpendable: z.number(),
  utxosUnspendable: z.number(),
  blockchainSize: z.number(),
  creditPoolBalance: zBigint.nullish(),
  circulatingSupply: zBigint,
  difficulty: z.number(),
  hashrate: z.number(),
})
export type HyMetrics = z.output<typeof HyMetricsSchema>

export const HyMetricsChartSchema = z.object({
  asOfHeight: zAsOfHeight,
  startHeight: z.number(),
  endHeight: z.number(),
  bucketBlocks: z.number(),
  value: z.array(HyMetricsSchema),
})
export type HyMetricsChart = z.output<typeof HyMetricsChartSchema>

export const HyMempoolSchema = z.object({
  count: z.number(),
  totalBytes: z.number(),
  usageBytes: z.number().nullish(),
  maxBytes: z.number().nullish(),
  updatedAt: zIsoDate,
  recentHashes: z.array(CHAIN_HASH),
})
export type HyMempool = z.output<typeof HyMempoolSchema>

export const HyMempoolTxSchema = z.object({
  txHash: CHAIN_HASH,
  txType: z.string(),
  txSize: z.number(),
  valueOut: zBigint,
  firstSeenAt: zIsoDate,
  lastSeenAt: zIsoDate,
  tags: TxTagsSchema.nullish(),
})
export type HyMempoolTx = z.output<typeof HyMempoolTxSchema>

export const HyNetworkSchema = z.object({
  networkInfo: z.object({
    version: z.number(),
    subversion: z.string(),
    protocolVersion: z.number(),
    connections: z.number(),
    relayFee: z.number().nullish(),
    warnings: z.string().nullish(),
  }),
  peerInfo: z.array(
    z.object({
      id: z.number(),
      addr: z.string(),
      subversion: z.string().nullish(),
      inbound: z.boolean().nullish(),
      startingHeight: z.number().nullish(),
    }),
  ),
  peerCount: z.number(),
  validators: z.object({
    regular: z.object({ total: z.number(), status: z.record(z.string(), z.number()) }),
    evonode: z.object({ total: z.number(), status: z.record(z.string(), z.number()) }),
  }),
  updatedAt: zIsoDate,
})
export type HyNetwork = z.output<typeof HyNetworkSchema>

export const HyProposalSchema = z.object({
  hash: CHAIN_HASH,
  collateralHash: CHAIN_HASH.nullish(),
  name: z.string(),
  url: z.string().nullish(),
  paymentAddress: z.string(),
  paymentAmount: zBigint,
  startTime: zIsoDate,
  endTime: zIsoDate,
  creationTime: zIsoDate.nullish(),
  votes: z.object({ yes: z.number(), no: z.number(), abstain: z.number() }),
  fundingThreshold: z.number().nullish(),
  meetsFundingThreshold: z.boolean().nullish(),
  funded: z.boolean().nullish(),
  valid: z.boolean().nullish(),
})
export type HyProposal = z.output<typeof HyProposalSchema>

export const HyProposalVoteSchema = z.object({
  proTxHash: CHAIN_HASH,
  vote: z.string(),
  voteTime: zIsoDate,
})
export type HyProposalVote = z.output<typeof HyProposalVoteSchema>

const HyValidatorBaseSchema = z.object({
  proTxHash: CHAIN_HASH,
  collateralHash: CHAIN_HASH.nullish(),
  collateralIndex: z.number().nullish(),
  addresses: z
    .object({
      owner: z.string().nullish(),
      voting: z.string().nullish(),
      payout: z.string().nullish(),
    })
    .nullish(),
  live: z
    .object({
      type: z.string().nullish(),
      valid: z.boolean().nullish(),
      status: z.string().nullish(),
      lastPaidHeight: z.number().nullish(),
      lastPaidAt: zIsoDate.nullish(),
      consecutivePayments: z.number().nullish(),
      pose: z
        .object({
          banScore: z.number().nullish(),
          revivedHeight: z.number().nullish(),
          banHeight: z.number().nullish(),
        })
        .nullish(),
      revocationReason: z.number().nullish(),
    })
    .nullish(),
  operatorPubKey: zHex.nullish(),
  operatorReward: z.number().nullish(),
  type: z.string(),
  status: z.string(),
  services: z
    .object({
      coreP2p: z.array(z.string()).nullish(),
      platformP2p: z.array(z.string()).nullish(),
      platformHttps: z.array(z.string()).nullish(),
    })
    .nullish(),
  registeredHeight: z.number(),
  lastUpdatedHeight: z.number().nullish(),
})

export const HyValidatorSchema = HyValidatorBaseSchema
export type HyValidator = z.output<typeof HyValidatorSchema>

export const HyValidatorDetailSchema = HyValidatorBaseSchema.extend({
  asOfHeight: zAsOfHeight,
  history: z.array(
    z.object({
      txHash: CHAIN_HASH,
      txType: z.string(),
      payload: z.record(z.string(), z.unknown()).nullish(),
      blockHeight: z.number(),
    }),
  ),
})
export type HyValidatorDetail = z.output<typeof HyValidatorDetailSchema>

export const HySearchSchema = z.object({
  value: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('address'), address: z.string() }),
      z
        .object({
          type: z.literal('block'),
          hash: CHAIN_HASH.optional(),
          height: z.number().optional(),
        })
        .catchall(z.unknown()),
      z.object({ type: z.literal('tx'), hash: CHAIN_HASH.optional() }).catchall(z.unknown()),
      z
        .object({
          type: z.literal('validator'),
          proTxHash: CHAIN_HASH.optional(),
          hash: CHAIN_HASH.optional(),
        })
        .catchall(z.unknown()),
      z.object({ type: z.literal('proposal'), hash: CHAIN_HASH }),
    ]),
  ),
})
export type HySearch = z.output<typeof HySearchSchema>

const stamp = zUnixSeconds

export const HyStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('mempool_tx'),
    ts: stamp,
    payload: z
      .object({ txid: CHAIN_HASH.optional(), txHash: CHAIN_HASH.optional() })
      .catchall(z.unknown()),
  }),
  z.object({
    type: z.literal('chain_lock'),
    ts: stamp,
    payload: z.object({
      blockHash: CHAIN_HASH,
      blockHeight: z.number(),
      sequence: z.number().nullish(),
      rawChainlock: zHex.nullish(),
    }),
  }),
  z.object({ type: z.literal('governance_object'), ts: stamp, payload: z.unknown() }),
  z.object({ type: z.literal('governance_vote'), ts: stamp, payload: z.unknown() }),
  z.object({ type: z.literal('network'), ts: stamp, payload: z.unknown() }),
  z.object({ type: z.literal('heartbeat'), ts: stamp.optional(), payload: z.unknown().optional() }),
])
export type HyStreamEvent = z.output<typeof HyStreamEventSchema>
