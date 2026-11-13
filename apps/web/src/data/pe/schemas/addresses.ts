import { z } from 'zod'
import { zBigint } from '../../zod'

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
