import { z } from 'zod'
import { zBigint, zHex64 } from '../../zod'
import { seconds } from './common'

export const RadarPaymentSchema = z.object({
  height: z.number(),
  time: seconds,
  amount_duffs: zBigint,
  block_hash: zHex64,
})

export type RadarPayment = z.output<typeof RadarPaymentSchema>

export const RadarPaymentsSchema = z.object({ payments: z.array(RadarPaymentSchema) })
