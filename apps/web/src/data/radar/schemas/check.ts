import { z } from 'zod'
import { seconds } from './common'

export const RadarCheckSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullish(),
  connect_ms: z.number().nullish(),
  handshake_ms: z.number().nullish(),
  user_agent: z.string().nullish(),
  protocol: z.number().nullish(),
  height: z.number().nullish(),
  from: z.string().nullish(),
  checked: seconds.nullish(),
  cached: z.boolean().nullish(),
})

export type RadarCheck = z.output<typeof RadarCheckSchema>
