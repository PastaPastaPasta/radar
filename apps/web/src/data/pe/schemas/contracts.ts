import { z } from 'zod'
import { zBigint, zHex64, zIsoDate } from '../../zod'
import { nullableString } from './common'
import { PeOwnerSchema } from './identities'

export const PeDataContractSchema = z.object({
  identifier: z.string(),
  name: nullableString.optional(),
  owner: PeOwnerSchema.nullish(),
  schema: z.string().nullish(),
  version: z.number().nullish(),
  txHash: zHex64.nullish(),
  timestamp: zIsoDate.nullish(),
  isSystem: z.boolean().nullish(),
  documentsCount: z.number().nullish(),
  tokensCount: z.number().nullish(),
  identitiesInteracted: z.number().nullish(),
  totalGasUsed: z.number().nullish(),
  averageGasUsed: z.number().nullish(),
  description: z.string().nullish(),
  keywords: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
})

export type PeDataContract = z.output<typeof PeDataContractSchema>

export const PeContractTransactionSchema = z.object({
  hash: zHex64,
  type: z.string(),
  action: z
    .array(
      z.object({
        action: z.string(),
        documentIdentifier: z.string().nullish(),
        tokenIdentifier: z.string().nullish(),
        recipient: z.string().nullish(),
        price: zBigint.nullish(),
        amount: zBigint.nullish(),
      }),
    )
    .nullish()
    .transform((v) => v ?? []),
  owner: PeOwnerSchema.nullish(),
  timestamp: zIsoDate,
  gasUsed: z.number().nullish(),
  error: z.string().nullish(),
})

export type PeContractTransaction = z.output<typeof PeContractTransactionSchema>

export const PeContractActivitySchema = z.object({
  identifier: z.string(),
  transitionsCount: z.number(),
})

export type PeContractActivity = z.output<typeof PeContractActivitySchema>
