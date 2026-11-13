import { z } from 'zod'
import { zHex64 } from '../../zod'
import { seconds } from './common'

export const RadarChangeSchema = z.object({
  ts: seconds,
  height: z.number(),
  protx: zHex64,
  type: z.string(),
  field: z.string(),
  old: z.unknown(),
  new: z.unknown(),
})

export type RadarChange = z.output<typeof RadarChangeSchema>

export const RadarChangesSchema = z.object({
  since: seconds,
  changes: z.array(RadarChangeSchema),
})

export type RadarChanges = z.output<typeof RadarChangesSchema>
