import { z } from 'zod'
import { zHex64, zIsoDate } from '../../zod'
import { PeAliasSchema } from './identities'

export const PeContestantSchema = z.object({
  identifier: z.string(),
  timestamp: zIsoDate.nullish(),
  documentIdentifier: z.string().nullish(),
  documentStateTransition: zHex64.nullish(),
  aliases: z
    .array(PeAliasSchema)
    .nullish()
    .transform((v) => v ?? []),
  towardsIdentityVotes: z.number().nullish(),
  abstainVotes: z.number().nullish(),
  lockVotes: z.number().nullish(),
})

export const PeContestedResourceSchema = z.object({
  resourceValue: z.array(z.string().nullable()).nullish(),
  indexName: z.string().nullish(),
  dataContractIdentifier: z.string().nullish(),
  documentTypeName: z.string().nullish(),
  timestamp: zIsoDate.nullish(),
  endTimestamp: zIsoDate.nullish(),
  finished: z.boolean().nullish(),
  status: z.string().nullish(),
  totalCountVotes: z.number().nullish(),
  totalCountLock: z.number().nullish(),
  totalCountAbstain: z.number().nullish(),
  totalCountTowardsIdentity: z.number().nullish(),
  towardsIdentity: z.string().nullish(),
  prefundedVotingBalance: z.record(z.string(), z.number()).nullish(),
  contenders: z.array(PeContestantSchema).nullish(),
})

export type PeContestedResource = z.output<typeof PeContestedResourceSchema>

export const PeContestedResourcesStatsSchema = z.object({
  totalContestedResources: z.number(),
  totalPendingContestedResources: z.number(),
  totalVotesCount: z.number(),
  expiringContestedResource: PeContestedResourceSchema.nullish(),
})

export type PeContestedResourcesStats = z.output<typeof PeContestedResourcesStatsSchema>

export const PeVoteSchema = z.object({
  proTxHash: zHex64,
  txHash: zHex64.nullish(),
  voterIdentifier: z.string(),
  choice: z.number(),
  timestamp: zIsoDate,
  towardsIdentity: z.string().nullish(),
  identityAliases: z
    .array(PeAliasSchema)
    .nullish()
    .transform((v) => v ?? []),
  dataContractIdentifier: z.string().nullish(),
  documentTypeName: z.string().nullish(),
  documentIdentifier: z.string().nullish(),
  indexName: z.string().nullish(),
  indexValues: z.array(z.string()).nullish(),
  power: z.number().nullish(),
})

export type PeVote = z.output<typeof PeVoteSchema>
