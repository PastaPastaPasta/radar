import { z } from 'zod'
import { seconds } from './common'

export const BenchGradeSchema = z.object({
  letter: z.string(),
  score: z.number(),
  completeness: z.number().nullish(),
  connectivity: z.number().nullish(),
  latency: z.number().nullish(),
  reliability: z.number().nullish(),
  throughput: z.number().nullish(),
})

export const RadarBenchSchema = z.object({
  vantages: z.array(
    z.object({
      vantage: z.string(),
      location: z.string(),
      updated: seconds,
      tested: z.number(),
      failed: z.number(),
      cycle_days: z.number().nullish(),
      grades: z.record(z.string(), z.number()),
      headers_per_sec: z.array(z.number().nullable()),
      ping_ms: z.array(z.number().nullable()),
      scores: z.array(z.number().nullable()),
    }),
  ),
})

export type RadarBench = z.output<typeof RadarBenchSchema>
