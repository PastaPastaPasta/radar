import { z } from 'zod'
import { zHex64 } from '../../zod'
import { PePlatformAddressSchema } from './addresses'
import { PeBlockSummarySchema } from './blocks'
import { PeDataContractSchema } from './contracts'
import { PeDocumentSchema } from './documents'
import { PeTokenSchema } from './tokens'
import { PeTransactionSchema } from './transactions'

export const PeSearchSchema = z.object({
  identities: z
    .array(
      z.object({
        identifier: z.string(),
        alias: z.string().nullish(),
        status: z.unknown().optional(),
      }),
    )
    .nullish(),
  dataContracts: z.array(PeDataContractSchema).nullish(),
  blocks: z.array(PeBlockSummarySchema).nullish(),
  transactions: z.array(PeTransactionSchema).nullish(),
  validators: z.array(z.object({ proTxHash: zHex64 }).catchall(z.unknown())).nullish(),
  documents: z.array(PeDocumentSchema).nullish(),
  tokens: z.array(PeTokenSchema).nullish(),
  platformAddresses: z.array(PePlatformAddressSchema).nullish(),
})

export type PeSearch = z.output<typeof PeSearchSchema>
