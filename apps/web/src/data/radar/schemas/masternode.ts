import { z } from 'zod'
import { zBigint } from '../../zod'
import { RadarChangeSchema } from './changes'
import { seconds, secondsOrNull } from './common'
import { DkgReadinessSchema, RadarMasternodeSchema } from './masternodes'
import { RadarPaymentSchema } from './payments'

const PlatformHealthLatestSchema = z.object({
  ts: seconds,
  height: z.number().nullish(),
  catching_up: z.boolean().nullish(),
  peers: z.number().nullish(),
  node_protx: z.string().nullish(),
  cert: z.object({ expires: seconds.nullish(), issuer: z.string().nullish() }).nullish(),
  drive_protocol: z
    .object({
      current: z.number().nullish(),
      latest: z.number().nullish(),
      next_epoch: z.number().nullish(),
    })
    .nullish(),
  https: z.object({ ms: z.number().nullish(), error: z.string().nullish() }).nullish(),
  p2p: z.object({ ms: z.number().nullish(), error: z.string().nullish() }).nullish(),
  software: z
    .object({
      dapi: z.string().nullish(),
      drive: z.string().nullish(),
      tenderdash: z.string().nullish(),
    })
    .nullish(),
})

const PlatformRewardsSchema = z.object({
  annual_yield: z.number().nullish(),
  monthly: zBigint.nullish(),
  monthly_basis_days: z.number().nullish(),
  in_validator_sets: z.boolean().nullish(),
  first_epoch: z.number().nullish(),
  d30_of: z.number().nullish(),
  d30_percentile: z.number().nullish(),
  balance: z.object({ credits: zBigint, ts: seconds }).nullish(),
  balance_history: z.array(z.object({ credits: zBigint, ts: seconds })).nullish(),
  current: z
    .object({
      epoch: z.number(),
      blocks: z.number(),
      blocks_total: z.number().nullish(),
      accrued: zBigint.nullish(),
      pool_so_far: zBigint.nullish(),
      proposers: z.number().nullish(),
      rank: z.number().nullish(),
      turns: z
        .object({
          turns: z.number(),
          missed: z.number(),
          expected_blocks: z.number().nullish(),
          expected_share: z.number().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  epochs: z
    .array(
      z.object({
        epoch: z.number(),
        start: seconds,
        end: seconds,
        blocks: z.number(),
        credits: zBigint,
        of: z.number().nullish(),
        rank: z.number().nullish(),
        share: z.number().nullish(),
      }),
    )
    .nullish(),
  next: z
    .object({ eta: seconds.nullish(), slots: z.number().nullish(), sampled: seconds.nullish() })
    .nullish(),
  totals: z
    .object({
      lifetime: zBigint,
      d30: zBigint.nullish(),
      d90: zBigint.nullish(),
      d365: zBigint.nullish(),
      epochs_paid: z.number().nullish(),
      last_epoch: zBigint.nullish(),
      last_epoch_index: z.number().nullish(),
    })
    .nullish(),
  turns_30d: z
    .object({
      turns: z.number(),
      missed: z.number(),
      expected_share: z.number().nullish(),
    })
    .nullish(),
  vote: z.object({ version: z.number(), ts: seconds }).nullish(),
})

export const RadarMasternodeDetailSchema = RadarMasternodeSchema.omit({
  uptime_7d: true,
  uptime_30d: true,
  platform: true,
  dkg_readiness: true,
}).extend({
  dkg_readiness: DkgReadinessSchema.nullish(),
  collateral: z.string(),
  collateral_address: z.string().nullable(),
  owner_address: z.string(),
  voting_address: z.string().nullable(),
  operator_payout_address: z.string().nullable(),
  pubkey_operator: z.string(),
  first_seen: secondsOrNull,
  pose_revived_height: z.number().nullish(),
  revocation_reason: z.number().nullish(),
  removed: z.unknown().nullish(),
  relay: z.boolean().nullish(),
  consecutive_payments: z.number().nullish(),
  platform_banned: z.boolean().nullish(),
  platform_https: z.string().nullish(),
  platform_p2p: z.string().nullish(),
  core_p2p: z.array(z.object({ address: z.string(), network: z.string() })).nullish(),
  services: z.unknown().nullish(),
  uptime_daily: z.array(z.object({ day: z.string(), attempts: z.number(), ok: z.number() })),
  versions: z.array(z.object({ ts: seconds, protocol: z.number(), user_agent: z.string() })),
  changes: z.array(RadarChangeSchema.omit({ protx: true, type: true }).partial()),
  payments: z.array(RadarPaymentSchema),
  payments_summary: z
    .object({
      count: z.number(),
      first_height: z.number().nullish(),
      total_duffs: zBigint,
      indexed: z.object({ from: z.number(), to: z.number() }),
    })
    .nullish(),
  returns: z
    .object({
      annual_yield: z.number().nullish(),
      indexed_since: seconds.nullish(),
      paid_30d: zBigint.nullish(),
      paid_90d: zBigint.nullish(),
      paid_365d: zBigint.nullish(),
      window_days: z.number().nullish(),
    })
    .nullish(),
  platform: z
    .object({
      latest: PlatformHealthLatestSchema.nullish(),
      daily: z.array(z.object({ day: z.string(), attempts: z.number(), ok: z.number() })).nullish(),
    })
    .nullish(),
  platform_rewards: PlatformRewardsSchema.nullish(),
})

export type RadarMasternodeDetail = z.output<typeof RadarMasternodeDetailSchema>
