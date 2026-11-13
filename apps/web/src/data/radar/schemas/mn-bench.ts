import { z } from 'zod'
import { zHex64 } from '../../zod'
import { BenchGradeSchema } from './bench'
import { seconds } from './common'

export const RadarMnBenchSchema = z.object({
  protx: zHex64,
  vantages: z.array(
    z.object({
      vantage: z.string(),
      location: z.string(),
      percentile: z.number().nullish(),
      results: z.array(
        z.object({
          ts: seconds,
          ok: z.boolean(),
          error: z.string().nullable(),
          address: z.string().nullish(),
          connect_ms: z.number().nullish(),
          handshake_ms: z.number().nullish(),
          height: z.number().nullish(),
          protocol: z.number().nullish(),
          user_agent: z.string().nullish(),
          grade: BenchGradeSchema.nullish(),
          headers: z
            .object({
              valid: z.boolean(),
              served: z.number(),
              requested: z.number(),
              per_sec: z.number(),
              seconds: z.number(),
              stalls: z.number(),
              bytes: z.number(),
              start_height: z.number(),
            })
            .nullish(),
          mnlistdiff: z
            .object({
              ok: z.boolean(),
              entries: z.number().nullish(),
              bytes: z.number().nullish(),
              seconds: z.number().nullish(),
            })
            .nullish(),
          ping_ms: z
            .object({
              min: z.number(),
              median: z.number(),
              max: z.number(),
              samples: z.number(),
            })
            .nullish(),
        }),
      ),
    }),
  ),
  combined: z.object({ score: z.number(), letter: z.string(), vantages: z.number() }).nullish(),
})

export type RadarMnBench = z.output<typeof RadarMnBenchSchema>
