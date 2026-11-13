import { z } from 'zod'
import { zBigint, zHex64 } from '../../zod'
import { seconds } from './common'

const SpreadSchema = z.object({
  min: z.number(),
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
  max: z.number(),
})

export const RadarPlatformSchema = z.object({
  now: z.object({
    epoch: z.number(),
    start: seconds,
    ends: seconds,
    epoch_secs: z.number(),
    first_height: z.number(),
    height: z.number(),
    core_height: z.number(),
    blocks: z.number(),
    proposers: z.number(),
    pool_so_far: zBigint,
    protocol_version: z.number(),
    updated: seconds,
  }),
  upgrade: z.object({
    phase: z.string(),
    current: z.number(),
    next_epoch: z.number().nullish(),
    next_epoch_reported_by: z.number().nullish(),
    candidate: z.number().nullable(),
    enabled_evonodes: z.number(),
    required: z.number(),
    votes: z.number(),
    versions: z.array(z.tuple([z.number(), z.number()])),
  }),
  returns: z.object({
    evonodes_paid: z.number(),
    median_monthly: zBigint,
    median_platform_yield: z.number().nullish(),
    monthly_basis_days: z.number().nullish(),
    yield_span_days: z.number().nullish(),
  }),
  epochs: z.array(
    z.object({
      epoch: z.number(),
      start: seconds,
      end: seconds,
      duration: z.number(),
      first_height: z.number(),
      blocks: z.number(),
      proposers: z.number(),
      core_rewards: zBigint,
      fees: zBigint,
      pool: zBigint,
      per_block: zBigint,
      protocol_version: z.number(),
      blocks_spread: SpreadSchema,
      credits_spread: z.object({
        min: zBigint,
        p10: zBigint,
        p50: zBigint,
        p90: zBigint,
        max: zBigint,
      }),
    }),
  ),
  schedule: z.object({
    epoch: z.number(),
    height: z.number(),
    ts: seconds,
    block_secs: z.number(),
    next: z.array(z.object({ protx: zHex64, eta: seconds, slots: z.number() })),
  }),
  evonodes: z.array(
    z.object({
      protx: zHex64,
      service: z.string().nullable(),
      status: z.string(),
      drive: z.string().nullish(),
      balance: zBigint.nullish(),
      d30: zBigint.nullish(),
      last_epoch: zBigint.nullish(),
      monthly: zBigint.nullish(),
      epoch_blocks: z.number().nullish(),
      last_blocks: z.number().nullish(),
      next: seconds.nullish(),
      supports: z.number().nullish(),
      vote: z.number().nullish(),
    }),
  ),
})

export type RadarPlatform = z.output<typeof RadarPlatformSchema>
