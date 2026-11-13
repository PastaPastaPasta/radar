import { z } from 'zod'
import { zHex64, zIsoDate } from '../../zod'
import { PeQuorumSchema } from './quorums'
import { PeTransactionSchema } from './transactions'

export const PeBlockHeaderSchema = z.object({
  hash: zHex64,
  height: z.number(),
  timestamp: zIsoDate,
  blockVersion: z.number().nullish(),
  appVersion: z.number().nullish(),
  l1LockedHeight: z.number().nullish(),
  l1LockedBlockHash: zHex64.nullish(),
  validator: zHex64,
  totalGasUsed: z.number().nullish(),
  appHash: zHex64.nullish(),
  quorumHash: zHex64.nullish(),
})

export type PeBlockHeader = z.output<typeof PeBlockHeaderSchema>

export const PeBlockSummarySchema = z.object({
  header: PeBlockHeaderSchema,
  txs: z
    .array(z.unknown())
    .nullish()
    .transform((v) => v ?? []),
})

export type PeBlockSummary = z.output<typeof PeBlockSummarySchema>

export const PeBlockSchema = PeBlockSummarySchema.extend({
  txs: z
    .array(PeTransactionSchema)
    .nullish()
    .transform((v) => v ?? []),
  quorum: PeQuorumSchema.nullish(),
})

export type PeBlock = z.output<typeof PeBlockSchema>
