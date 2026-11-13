import { z } from 'zod'
import { zCount, zHex64, zIsoDate } from '../../zod'
import { PeOwnerSchema } from './identities'

export const PeDocumentSchema = z.object({
  identifier: z.string(),
  dataContractIdentifier: z.string().nullish(),
  revision: z.number().nullish(),
  txHash: zHex64.nullish(),
  deleted: z.boolean().nullish(),
  data: z.string().nullish(),
  timestamp: zIsoDate.nullish(),
  system: z.boolean().nullish(),
  entropy: z.string().nullish(),
  documentTypeName: z.string().nullish(),
  transitionType: z.string().nullish(),
  identityContractNonce: zCount.nullish(),
  gasUsed: z.number().nullish(),
  totalGasUsed: z.number().nullish(),
  owner: PeOwnerSchema.nullish(),
})

export type PeDocument = z.output<typeof PeDocumentSchema>
