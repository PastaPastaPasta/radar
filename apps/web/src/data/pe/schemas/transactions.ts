import { z } from 'zod'
import { zBigint, zCount, zHex64, zIsoDate } from '../../zod'
import { PeOwnerSchema } from './identities'

const PeTransactionRowSchema = z.object({
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

export const PeTransactionSchema = PeTransactionRowSchema.extend({
  shielded: z.object({ amount: zBigint.nullish(), direction: z.string().nullish() }).nullish(),
  /** The same transition seen again in later blocks, as Explorer lists them (the later ones failed). */
  duplicates: z.array(PeTransactionRowSchema).nullish(),
})

export type PeTransaction = z.output<typeof PeTransactionSchema>

/**
 * Tenderdash's CheckTx answer. Platform Explorer sends `result` as a boolean or as "ok"/"error", puts the consensus
 * error's class name in `error` and its number in `code`; `info` is the error serialized, which Radar does not read.
 */
export const PeVerifySchema = z.object({
  result: z.union([z.boolean(), z.string()]).nullish(),
  error: z.string().nullish(),
  code: z.number().nullish(),
  gasWanted: zCount.nullish(),
  info: z.string().nullish(),
})

export type PeVerify = z.output<typeof PeVerifySchema>
