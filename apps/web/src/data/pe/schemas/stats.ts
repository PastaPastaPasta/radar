import { z } from 'zod'
import { zBigint, zHex64 } from '../../zod'

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
