import { z } from 'zod'
import { zHex64 } from '../../zod'
import { seconds, secondsOrNull } from './common'

const ActivationDeploymentSchema = z.object({
  name: z.string(),
  state: z.string(),
  since: z.number(),
  signed: z.boolean(),
  consistent: z.boolean(),
  mismatches: z.array(z.unknown()),
  params: z.object({
    bit: z.number(),
    ehf: z.boolean(),
    window: z.number(),
    start_time: secondsOrNull,
    timeout: secondsOrNull,
    threshold_start: z.number(),
    threshold_min: z.number(),
    falloff_coeff: z.number(),
    min_activation_height: z.number(),
  }),
  recent: z.object({ blocks: z.number(), count: z.number() }),
  schedule: z.array(z.object({ attempt: z.number(), threshold: z.number() })),
  ehf: z.object({
    block: z.unknown().nullish(),
    height: z.number().nullish(),
    gate: z
      .object({
        llmq: z.string(),
        min_protocol: z.number(),
        checked: seconds,
        quorums: z.array(
          z.object({
            hash: zHex64,
            height: z.number(),
            members: z.number(),
            valid: z.number(),
            current: z.number(),
            older: z.number(),
            unknown: z.number(),
            selected: z.boolean(),
          }),
        ),
      })
      .nullish(),
  }),
  outlook: z.object({ phase: z.string() }).catchall(z.unknown()),
  rpc: z.object({ type: z.string(), active: z.boolean() }).catchall(z.unknown()),
  window: z.record(z.string(), z.unknown()).nullish(),
  windows: z.array(z.record(z.string(), z.unknown())).nullish(),
})

export const RadarActivationSchema = z.object({
  network: z.string(),
  updated: seconds,
  dashd: z.string(),
  error: z.string().nullable(),
  mnhf: z.string().nullish(),
  block_seconds: z.number(),
  pace_blocks: z.number(),
  tip: z.object({ height: z.number(), time: seconds, mediantime: seconds }),
  deployments: z.array(ActivationDeploymentSchema),
})

export type RadarActivation = z.output<typeof RadarActivationSchema>
