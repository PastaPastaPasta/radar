import { z } from 'zod'
import { zBigint, zCount, zHex64, zIsoDate } from '../../zod'

export const PeEpochSchema = z.object({
  number: z.number(),
  firstBlockHeight: zCount,
  firstCoreBlockHeight: z.number(),
  startTime: z.number(),
  endTime: z.number(),
  feeMultiplier: zCount.nullish(),
})

export type PeEpoch = z.output<typeof PeEpochSchema>

const BlockRefSchema = z.object({
  height: z.number(),
  hash: zHex64,
  timestamp: zIsoDate,
})

export const PeStatusSchema = z.object({
  epoch: PeEpochSchema,
  transactionsCount: z.number(),
  transfersCount: z.number(),
  dataContractsCount: z.number(),
  documentsCount: z.number(),
  identitiesCount: z.number(),
  totalCredits: zBigint,
  totalCollectedFeesDay: z.number().nullish(),
  network: z.string().nullish(),
  api: z.object({ version: z.string(), block: BlockRefSchema }),
  tenderdash: z.object({ version: z.string(), block: BlockRefSchema }),
  indexer: z.object({ status: z.string(), syncProgress: z.number() }),
  versions: z
    .object({
      software: z.object({
        dapi: z.string().nullish(),
        drive: z.string().nullish(),
        tenderdash: z.string().nullish(),
      }),
      protocol: z.object({
        tenderdash: z.object({ p2p: z.number().nullable(), block: z.number() }),
        drive: z.object({ latest: z.number(), current: z.number() }),
      }),
    })
    .nullish(),
})

export type PeStatus = z.output<typeof PeStatusSchema>

/** PE answers a 503 with only `{ error }` when its backend is down. */

export const PeStatusOrErrorSchema = z.union([PeStatusSchema, z.object({ error: z.unknown() })])

export const PeEpochDetailSchema = z.object({
  epoch: PeEpochSchema,
  tps: z.number().nullish(),
  totalCollectedFees: zBigint.nullish(),
  bestValidator: zHex64.nullish(),
  totalVotesCount: z.number().nullish(),
  totalTxCount: z.number().nullish(),
  totalCreatedDocumentsCount: z.number().nullish(),
  totalDeletedDocumentsCount: z.number().nullish(),
  totalRegisteredNamesCount: z.number().nullish(),
  totalContestedDocumentsCount: z.number().nullish(),
  avgBlockTime: z.number().nullish(),
})

export type PeEpochDetail = z.output<typeof PeEpochDetailSchema>
