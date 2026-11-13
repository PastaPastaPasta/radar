import { z } from 'zod'
import { seconds } from './common'
import type { RadarDim, RadarScope } from './summary'

export interface RadarHistoryQuery {
  dim: RadarDim
  scope?: RadarScope
  days?: 1 | 7 | 14 | 30 | 90 | 365
  top?: number
}

export const RadarHistorySchema = z.object({
  t: z.array(seconds),
  resolution: z.string(),
  series: z.array(z.object({ key: z.string(), values: z.array(z.number().nullable()) })),
})

export type RadarHistory = z.output<typeof RadarHistorySchema>
