import { z } from 'zod'
import { zBigint, zHex64, zIsoDate } from '../../zod'
import { PeBlockHeaderSchema } from './blocks'

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
  epochInfo: z
    .object({
      number: z.number(),
      startTime: z.number().nullish(),
      endTime: z.number().nullish(),
    })
    .nullish(),
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
