import { z } from 'zod'
import { zHex64 } from '../../zod'

export const PeQuorumSchema = z.object({
  type: z.string(),
  quorumHash: zHex64,
  quorumIndex: z.number().nullish(),
  quorumPublicKey: z.string().nullish(),
  blockHeight: z.number().nullish(),
  creationHeight: z.number().nullish(),
  minedBlockHash: zHex64.nullish(),
  numValidMembers: z.number().nullish(),
  healthRatio: z.string().nullish(),
  previousConsecutiveDKGFailures: z.number().nullish(),
  isCurrent: z.boolean().nullish(),
  members: z
    .array(
      z.object({
        proTxHash: zHex64,
        service: z.string().nullish(),
        pubKeyOperator: z.string().nullish(),
        valid: z.boolean(),
        addresses: z.record(z.string(), z.array(z.string())).nullish(),
      }),
    )
    .nullish(),
})

export type PeQuorum = z.output<typeof PeQuorumSchema>
