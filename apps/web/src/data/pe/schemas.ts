import { z } from 'zod'
import type { Page } from '../page'
import { zBigint, zCount, zHex64, zIsoDate } from '../zod'

const nullableString = z.string().nullable()

export const PeAliasSchema = z.object({
  alias: z.string(),
  status: z.string().nullish(),
  contested: z.boolean().nullish(),
  timestamp: zIsoDate.nullish(),
  documentId: z.string().nullish(),
  txHash: z.string().nullish(),
})
export type PeAlias = z.output<typeof PeAliasSchema>

export const PeOwnerSchema = z
  .union([
    z.string(),
    z.object({
      identifier: z.string().nullable(),
      aliases: z.array(PeAliasSchema).nullish(),
    }),
  ])
  .transform((v) =>
    typeof v === 'string'
      ? { identifier: v, aliases: [] as PeAlias[] }
      : { identifier: v.identifier, aliases: v.aliases ?? [] },
  )
export type PeOwner = z.output<typeof PeOwnerSchema>

export function peList<T extends z.ZodType>(item: T) {
  return z
    .object({
      resultSet: z.array(item),
      pagination: z.object({
        page: z.number().nullish(),
        limit: z.number().nullish(),
        total: z.number().nullish(),
      }),
    })
    .transform((v): Page<z.output<T>> => ({
      items: v.resultSet,
      page: v.pagination.page ?? undefined,
      total:
        v.pagination.total === undefined || v.pagination.total === null || v.pagination.total < 0
          ? undefined
          : v.pagination.total,
    }))
}

export function peSeries<T extends z.ZodObject>(data: T) {
  return z.array(z.object({ timestamp: zIsoDate, data })).transform((rows) => {
    const typed = rows as unknown as { timestamp: number; data: z.output<T> }[]
    return typed.map((r) => ({ t: r.timestamp, ...r.data }))
  })
}

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

export const PeRateSchema = z.object({
  usd: z.number(),
  btc: z.number().nullish(),
  source: z.string(),
})
export type PeRate = z.output<typeof PeRateSchema>

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

export const PeTransactionSchema = z.object({
  hash: zHex64,
  index: z.number().nullish(),
  blockHash: zHex64.nullish(),
  blockHeight: z.number().nullish(),
  type: z.string(),
  batchType: z.union([z.string(), z.number()]).nullish(),
  data: z.string().nullish(),
  timestamp: zIsoDate,
  gasUsed: z.number().nullish(),
  status: z.string(),
  error: z.string().nullish(),
  owner: PeOwnerSchema.nullish(),
  incoming: z.boolean().nullish(),
  amount: zBigint.nullish(),
  base58Address: z.string().nullish(),
  bech32mAddress: z.string().nullish(),
  addressesCount: z.number().nullish(),
})
export type PeTransaction = z.output<typeof PeTransactionSchema>

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

export const PeBlockSummarySchema = z.object({
  header: PeBlockHeaderSchema,
  txs: z
    .array(z.unknown())
    .nullish()
    .transform((v) => v ?? []),
})
export type PeBlockSummary = z.output<typeof PeBlockSummarySchema>

export const PeBlockSchema = PeBlockSummarySchema.extend({ quorum: PeQuorumSchema.nullish() })
export type PeBlock = z.output<typeof PeBlockSchema>

const PublicKeySchema = z.object({
  keyId: z.number(),
  keyType: z.string(),
  data: z.string().nullish(),
  purpose: z.string(),
  securityLevel: z.string(),
  readOnly: z.boolean().nullish(),
  publicKeyHash: z.string().nullish(),
  disabledAt: z.number().nullish(),
})

export const PeIdentitySchema = z.object({
  identifier: z.string(),
  revision: zCount.nullish(),
  balance: zBigint.nullish(),
  timestamp: zIsoDate.nullish(),
  txHash: zHex64.nullish(),
  totalTxs: z.number().nullish(),
  totalTransfers: z.number().nullish(),
  totalDocuments: z.number().nullish(),
  totalDataContracts: z.number().nullish(),
  isSystem: z.boolean().nullish(),
  aliases: z
    .array(PeAliasSchema)
    .nullish()
    .transform((v) => v ?? []),
  totalGasSpent: z.number().nullish(),
  totalTopUpsAmount: zBigint.nullish(),
  totalWithdrawalsAmount: zBigint.nullish(),
  lastWithdrawalHash: zHex64.nullish(),
  lastWithdrawalTimestamp: zIsoDate.nullish(),
  publicKeys: z
    .array(PublicKeySchema)
    .nullish()
    .transform((v) => v ?? []),
  fundingCoreTx: z.string().nullish(),
  nonce: zCount.nullish(),
  type: z.string().nullish(),
  owner: z.string().nullish(),
})
export type PeIdentity = z.output<typeof PeIdentitySchema>

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

export const PeTransferSchema = z.object({
  amount: zBigint,
  sender: z.string().nullish(),
  recipient: z.string().nullish(),
  timestamp: zIsoDate,
  txHash: zHex64,
  type: z.string(),
  blockHash: zHex64.nullish(),
  gasUsed: z.number().nullish(),
  status: z.string().nullish(),
  error: z.string().nullish(),
})
export type PeTransfer = z.output<typeof PeTransferSchema>

const TokenLocalizationSchema = z.object({
  pluralForm: z.string(),
  singularForm: z.string(),
  shouldCapitalize: z.boolean().nullish(),
})

export const PeTokenSchema = z.object({
  identifier: z.string(),
  position: z.number().nullish(),
  timestamp: zIsoDate.nullish(),
  description: z.string().nullish(),
  localizations: z.record(z.string(), TokenLocalizationSchema).nullish(),
  baseSupply: zBigint.nullish(),
  totalSupply: zBigint.nullish(),
  maxSupply: zBigint.nullish(),
  owner: PeOwnerSchema.nullish(),
  mintable: z.boolean().nullish(),
  burnable: z.boolean().nullish(),
  freezable: z.boolean().nullish(),
  unfreezable: z.boolean().nullish(),
  destroyable: z.boolean().nullish(),
  allowedEmergencyActions: z.boolean().nullish(),
  dataContractIdentifier: z.string(),
  decimals: z.number().nullish(),
  totalTransitionsCount: z.number().nullish(),
  totalGasUsed: z.number().nullish(),
  balance: zBigint.nullish(),
})
export type PeToken = z.output<typeof PeTokenSchema>

export const PeTokenHolderSchema = z.object({
  balance: zBigint,
  holder: PeOwnerSchema,
})
export type PeTokenHolder = z.output<typeof PeTokenHolderSchema>

export const PeTokenTransitionSchema = z.object({
  action: z.string(),
  amount: zBigint.nullish(),
  recipient: z.string().nullish(),
  owner: PeOwnerSchema.nullish(),
  stateTransitionHash: zHex64,
  timestamp: zIsoDate,
  publicNote: z.string().nullish(),
})
export type PeTokenTransition = z.output<typeof PeTokenTransitionSchema>

export const PeTokenRatingSchema = z.object({
  tokenIdentifier: z.string(),
  transitionCount: z.number(),
  localizations: z.record(z.string(), TokenLocalizationSchema).nullish(),
})
export type PeTokenRating = z.output<typeof PeTokenRatingSchema>

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
  resourceValue: z.array(z.string()).nullish(),
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

const ProTxStateSchema = z.object({
  service: z.string().nullish(),
  registeredHeight: z.number().nullish(),
  lastPaidHeight: z.number().nullish(),
  consecutivePayments: z.number().nullish(),
  PoSePenalty: z.number().nullish(),
  PoSeRevivedHeight: z.number().nullish(),
  PoSeBanHeight: z.number().nullish(),
  revocationReason: z.number().nullish(),
  ownerAddress: z.string().nullish(),
  votingAddress: z.string().nullish(),
  payoutAddress: z.string().nullish(),
  platformNodeID: z.string().nullish(),
  platformP2PPort: z.number().nullish(),
  platformHTTPPort: z.number().nullish(),
  pubKeyOperator: z.string().nullish(),
})

export const PeValidatorSchema = z.object({
  proTxHash: zHex64,
  isActive: z.boolean(),
  proposedBlocksAmount: z.number().nullish(),
  lastProposedBlockHeader: PeBlockHeaderSchema.nullish(),
  proTxInfo: z
    .object({
      type: z.string().nullish(),
      collateralHash: z.string().nullish(),
      collateralIndex: z.number().nullish(),
      collateralAddress: z.string().nullish(),
      operatorReward: z.number().nullish(),
      confirmations: z.number().nullish(),
      state: ProTxStateSchema.nullish(),
    })
    .nullish(),
  identity: z.string().nullish(),
  identityBalance: zBigint.nullish(),
  totalReward: zBigint.nullish(),
  epochReward: zBigint.nullish(),
  withdrawalsCount: z.number().nullish(),
  lastWithdrawal: z.string().nullish(),
  lastWithdrawalTime: zIsoDate.nullish(),
  endpoints: z
    .record(
      z.string(),
      z.object({
        host: z.string(),
        port: z.number(),
        status: z.string(),
        message: z.string().nullish(),
      }),
    )
    .nullish(),
  geoIpInfo: z
    .object({
      ipv4: z.string().nullish(),
      countryCode: z.string().nullish(),
      city: z.string().nullish(),
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
    })
    .nullish(),
  registeredAt: zIsoDate.nullish(),
  votingIdentity: z.string().nullish(),
  votingIdentityBalance: zBigint.nullish(),
  poseScoreMax: z.number().nullish(),
  blocksUntilCorePayment: z.number().nullish(),
  coreYieldPerYear: z.number().nullish(),
})
export type PeValidator = z.output<typeof PeValidatorSchema>

export const PeValidatorEarningsSchema = z.object({
  core: z.object({ payments: z.number(), amount: zBigint }),
  platform: z.object({
    epochs: z.number(),
    firstEpoch: z.number().nullable(),
    lastEpoch: z.number().nullable(),
    blocksProposed: z.number(),
    reward: zBigint,
  }),
  estimate: z.object({
    periodDays: z.number(),
    eligible: z.boolean(),
    corePerMonth: z.number().nullable(),
    platformPerMonth: z.number().nullable(),
    totalPerMonth: z.number().nullable(),
  }),
})
export type PeValidatorEarnings = z.output<typeof PeValidatorEarningsSchema>

export const PePlatformAddressSchema = z.object({
  base58Address: z.string().nullish(),
  bech32mAddress: z.string(),
  nonce: z.number().nullish(),
  balance: zBigint.nullish(),
  totalTxs: z.number().nullish(),
  incomingTxs: z.number().nullish(),
  outgoingTxs: z.number().nullish(),
  totalIncomingAmount: zBigint.nullish(),
  totalOutgoingAmount: zBigint.nullish(),
})
export type PePlatformAddress = z.output<typeof PePlatformAddressSchema>

export const PeActiveIdentitySchema = z.object({
  identifier: z.string(),
  transactionsCount: zCount,
  aliases: z
    .array(PeAliasSchema)
    .nullish()
    .transform((v) => v ?? []),
})
export type PeActiveIdentity = z.output<typeof PeActiveIdentitySchema>

export const PeContractActivitySchema = z.object({
  identifier: z.string(),
  transitionsCount: z.number(),
})
export type PeContractActivity = z.output<typeof PeContractActivitySchema>

export const PeTxHistoryPointSchema = z.object({
  txs: z.number(),
  blockHeight: z.number(),
  blockHash: zHex64,
})
export const PeIdentityHistoryPointSchema = z.object({ registeredIdentities: z.number() })
export const PeShieldHistoryPointSchema = z.object({
  amount: zBigint,
  blockHeight: z.number(),
  blockHash: zHex64,
})
export const PeGasHistoryPointSchema = z.object({
  gas: z.number(),
  blockHeight: z.number(),
  blockHash: zHex64,
})
export const PeAvgBlockTimePointSchema = z.object({ avgBlockTime: z.number() })
export const PeBlocksCountPointSchema = z.object({ blocksCount: z.number() })
export const PeRewardPointSchema = z.object({ reward: zBigint })

export const PeTxStatisticSchema = z.array(
  z.object({
    transactionType: z.string(),
    count: z.number(),
    batchTypes: z.array(z.object({ batchType: z.string(), count: z.number() })).nullish(),
  }),
)
export type PeTxStatistic = z.output<typeof PeTxStatisticSchema>

export const PeShieldedStatisticSchema = z.object({
  totalShieldedIn: zBigint,
  totalShieldedOut: zBigint,
  transitionsCount: z.number(),
  types: z.array(
    z.object({ transactionType: z.string(), count: z.number(), amount: zBigint.nullish() }),
  ),
})
export type PeShieldedStatistic = z.output<typeof PeShieldedStatisticSchema>

export const PeShieldedPoolSchema = z.object({ poolBalance: zBigint, notesCount: z.number() })
export type PeShieldedPool = z.output<typeof PeShieldedPoolSchema>

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

export const PeVerifySchema = z.object({
  result: z.boolean().nullish(),
  error: z.string().nullish(),
  code: z.number().nullish(),
  gasWanted: zCount.nullish(),
  info: z.string().nullish(),
})
export type PeVerify = z.output<typeof PeVerifySchema>

export interface PeListQuery {
  page?: number
  limit?: number
  order?: 'asc' | 'desc'
}
