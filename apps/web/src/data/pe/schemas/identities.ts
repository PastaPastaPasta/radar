import { z } from 'zod'
import { zBigint, zCount, zHex64, zIsoDate } from '../../zod'

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

export const PeActiveIdentitySchema = z.object({
  identifier: z.string(),
  transactionsCount: zCount,
  aliases: z
    .array(PeAliasSchema)
    .nullish()
    .transform((v) => v ?? []),
})

export type PeActiveIdentity = z.output<typeof PeActiveIdentitySchema>
