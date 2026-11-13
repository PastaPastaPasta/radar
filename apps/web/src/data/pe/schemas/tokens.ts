import { z } from 'zod'
import { zBigint, zHex64, zIsoDate } from '../../zod'
import { PeOwnerSchema } from './identities'

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
