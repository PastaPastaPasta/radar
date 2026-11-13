import { z } from 'zod'
import { zHex64 } from '../../zod'
import { seconds, secondsOrNull } from './common'

/** A block and its time (Unix seconds as Radar sends them: `time` is the block's own, or an estimate at the recent pace). */
const ActivationBlockSchema = z.object({
  height: z.number(),
  time: z.number().nullish(),
  estimated: z.boolean().nullish(),
})

export type ActivationBlock = z.output<typeof ActivationBlockSchema>

const ActivationWindowSchema = z
  .object({
    attempt: z.number().nullish(),
    state: z.string().nullish(),
    count: z.number(),
    mined: z.number(),
    threshold: z.number().nullish(),
    since: z.number().nullish(),
    start: ActivationBlockSchema,
    end: ActivationBlockSchema,
    /** One character per mined block: `#` signalled, `-` did not. Only on the window being counted. */
    signalling: z.string().nullish(),
    needed: z.number().nullish(),
    possible: z.boolean().nullish(),
    reached: z.boolean().nullish(),
    remaining: z.number().nullish(),
  })
  .catchall(z.unknown())

export type ActivationWindow = z.output<typeof ActivationWindowSchema>

const ActivationOutlookSchema = z
  .object({
    phase: z.string(),
    start_time_reached: z.boolean().nullish(),
    start_time_block: ActivationBlockSchema.nullish(),
    first_threshold: z.number().nullish(),
    next_threshold: z.number().nullish(),
    margin_blocks: z.number().nullish(),
    needed: z.number().nullish(),
    possible: z.boolean().nullish(),
    remaining: z.number().nullish(),
    timeout: z.number().nullish(),
    earliest_start: ActivationBlockSchema.nullish(),
    earliest_lock_in: ActivationBlockSchema.nullish(),
    earliest_activation: ActivationBlockSchema.nullish(),
    next_window: ActivationBlockSchema.nullish(),
    window_end: ActivationBlockSchema.nullish(),
    lock_in_if_reached: ActivationBlockSchema.nullish(),
    activation_if_reached: ActivationBlockSchema.nullish(),
    activation: ActivationBlockSchema.nullish(),
    failed: ActivationBlockSchema.nullish(),
  })
  .catchall(z.unknown())

export type ActivationOutlook = z.output<typeof ActivationOutlookSchema>

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
    block: ActivationBlockSchema.nullish(),
    height: z.number().nullish(),
    gate: z
      .object({
        llmq: z.string(),
        min_protocol: z.number(),
        checked: seconds,
        size: z.number().nullish(),
        threshold: z.number().nullish(),
        request_id: z.string().nullish(),
        error: z.string().nullish(),
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
  outlook: ActivationOutlookSchema,
  rpc: z.object({ type: z.string(), active: z.boolean() }).catchall(z.unknown()),
  window: ActivationWindowSchema.nullish(),
  windows: z.array(ActivationWindowSchema).nullish(),
})

export const RadarActivationSchema = z.object({
  network: z.string(),
  updated: seconds,
  dashd: z.string(),
  error: z.union([z.string(), z.object({ message: z.string() }).catchall(z.unknown())]).nullable(),
  mnhf: z.string().nullish(),
  block_seconds: z.number(),
  pace_blocks: z.number(),
  tip: z.object({ height: z.number(), time: seconds, mediantime: seconds }),
  deployments: z.array(ActivationDeploymentSchema),
})

export type RadarActivationDeployment = z.output<typeof ActivationDeploymentSchema>

export type RadarActivation = z.output<typeof RadarActivationSchema>

const DAY_MS = 86_400_000

/**
 * Whether Core 24's activation is worth a link: it is pending (anything short of active), or went active less than
 * 30 days ago. Radar's activation times are Unix seconds. Hidden when the document has no `v24` deployment.
 */
export function v24Pending(doc: RadarActivation | undefined, now: number): boolean {
  const d = doc?.deployments.find((x) => x.name === 'v24')
  if (!d) return false
  if (d.outlook.phase !== 'active') return true
  const at = d.outlook.activation?.time
  return at != null && now - at * 1000 < 30 * DAY_MS
}
