import { z } from 'zod'
import { zBigint, zHex, zHex64 } from '../zod'

/** A coin amount Insight sends as a JSON number or a decimal string ("1.00000000"), in duffs. */
const zCoins = z
  .union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/)])
  .transform((v) => BigInt(Math.round(Number(v) * 1e8)))

const zSeconds = z.number().transform((s) => s * 1000)

export const InsStatusSchema = z.object({
  info: z.object({
    blocks: z.number(),
    network: z.string().nullish(),
    version: z.number().nullish(),
    errors: z.string().nullish(),
  }),
})
export type InsStatus = z.output<typeof InsStatusSchema>

export const InsBlockIndexSchema = z.object({ blockHash: zHex64 })

export const InsBlockSchema = z.object({
  hash: zHex64,
  height: z.number(),
  time: zSeconds,
  chainwork: zHex.nullish(),
  confirmations: z.number().nullish(),
  isMainChain: z.boolean().nullish(),
})
export type InsBlock = z.output<typeof InsBlockSchema>

/** Insight spells some fields twice ("txApperances" and "txAppearances"); either may be missing. */
export const InsAddressSchema = z
  .object({
    addrStr: z.string(),
    balanceSat: zBigint,
    totalReceivedSat: zBigint,
    totalSentSat: zBigint,
    unconfirmedBalanceSat: zBigint.nullish(),
    txApperances: z.number().nullish(),
    txAppearances: z.number().nullish(),
    unconfirmedAppearances: z.number().nullish(),
    unconfirmedTxApperances: z.number().nullish(),
  })
  .transform((a) => ({
    address: a.addrStr,
    balance: a.balanceSat,
    totalReceived: a.totalReceivedSat,
    totalSent: a.totalSentSat,
    unconfirmedBalance: a.unconfirmedBalanceSat ?? 0n,
    txCount: a.txAppearances ?? a.txApperances ?? 0,
    unconfirmedCount: a.unconfirmedAppearances ?? a.unconfirmedTxApperances ?? 0,
  }))
export type InsAddress = z.output<typeof InsAddressSchema>

const InsVinSchema = z.object({
  n: z.number().nullish(),
  txid: zHex64.nullish(),
  vout: z.number().nullish(),
  coinbase: zHex.nullish(),
  addr: z.string().nullish(),
  valueSat: zBigint.nullish(),
})

const InsVoutSchema = z.object({
  n: z.number(),
  value: zCoins,
  scriptPubKey: z.object({
    hex: zHex,
    addresses: z.array(z.string()).nullish(),
  }),
  spentTxId: zHex64.nullish(),
  spentIndex: z.number().nullish(),
  spentHeight: z.number().nullish(),
})

export const InsTxSchema = z.object({
  txid: zHex64,
  version: z.number().nullish(),
  type: z.number().nullish(),
  vin: z.array(InsVinSchema),
  vout: z.array(InsVoutSchema),
  blockhash: zHex64.nullish(),
  blockheight: z.number().nullish(),
  confirmations: z.number().nullish(),
  time: zSeconds.nullish(),
  blocktime: zSeconds.nullish(),
  valueOut: zCoins.nullish(),
  size: z.number().nullish(),
  txlock: z.boolean().nullish(),
})
export type InsTx = z.output<typeof InsTxSchema>

export const InsTxPageSchema = z.object({
  pagesTotal: z.number(),
  txs: z.array(InsTxSchema),
})
export type InsTxPage = z.output<typeof InsTxPageSchema>

export const InsUtxoSchema = z.object({
  address: z.string(),
  txid: zHex64,
  vout: z.number(),
  scriptPubKey: zHex,
  satoshis: zBigint,
  height: z.number().nullish(),
  confirmations: z.number().nullish(),
})
export type InsUtxo = z.output<typeof InsUtxoSchema>
export const InsUtxoListSchema = z.array(InsUtxoSchema)

export const InsProposalSchema = z.object({
  Hash: zHex64,
  DataObject: z.object({
    name: z.string(),
    url: z.string().nullish(),
    payment_address: z.string(),
    payment_amount: zCoins,
    start_epoch: zSeconds,
    end_epoch: zSeconds,
  }),
  AbsoluteYesCount: z.number(),
  YesCount: z.number(),
  NoCount: z.number(),
  AbstainCount: z.number(),
})
export type InsProposal = z.output<typeof InsProposalSchema>

export const InsProposalListSchema = z.array(InsProposalSchema)

/** Insight proxies Dash Core RPC as `{ result, error, id }`. */
export const InsGovernanceInfoSchema = z.object({
  result: z.object({
    fundingthreshold: z.number(),
    governancebudget: zCoins,
    nextsuperblock: z.number().nullish(),
  }),
})
export type InsGovernanceInfo = z.output<typeof InsGovernanceInfoSchema>['result']
