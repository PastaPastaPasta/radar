import { z } from 'zod'

export const PeRateSchema = z.object({
  usd: z.number(),
  btc: z.number().nullish(),
  source: z.string(),
})

export type PeRate = z.output<typeof PeRateSchema>
