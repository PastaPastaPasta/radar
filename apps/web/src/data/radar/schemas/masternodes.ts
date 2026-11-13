import { z } from 'zod'
import { zBigint, zHex64 } from '../../zod'
import { seconds, secondsOrNull } from './common'

export const DkgReadinessSchema = z.object({
  overall: z.string(),
  checks: z.record(z.string(), z.string()),
  rules: z.record(z.string(), z.unknown()).optional(),
})

const PlatformSummarySchema = z.object({
  in_sets: z.boolean().nullish(),
  epoch_blocks: z.number().nullish(),
  d30: zBigint.nullish(),
  last_epoch: zBigint.nullish(),
  next: seconds.nullish(),
})

export const RadarMasternodeSchema = z.object({
  protx: zHex64,
  type: z.enum(['Regular', 'Evo']),
  status: z.enum(['enabled', 'pose_banned']),
  service: z.string().nullable(),
  payout_address: z.string(),
  registered_height: z.number(),
  last_paid_height: z.number(),
  pose_penalty: z.number(),
  pose_ban_height: z.number(),
  operator_reward: z.number(),
  platform_node_id: z.string().nullable(),
  reachable: z.boolean().nullable(),
  version: z.string().nullable(),
  user_agent: z.string().nullable(),
  protocol: z.number().nullable(),
  latency_ms: z.number().nullable(),
  start_height: z.number().nullable(),
  uptime_7d: z.number().nullable(),
  uptime_30d: z.number().nullable(),
  last_seen: secondsOrNull,
  last_error: z.string().nullable(),
  network: z.string().nullable(),
  country: z.string().nullable(),
  continent: z.string().nullable(),
  city: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  asn: z.number().nullable(),
  as_org: z.string().nullable(),
  dkg_readiness: DkgReadinessSchema.nullish(),
  platform: PlatformSummarySchema.nullish(),
})

export type RadarMasternode = z.output<typeof RadarMasternodeSchema>

export const RadarMasternodesSchema = z.object({
  crawl_id: z.number().nullish(),
  tip: z.number().nullish(),
  masternodes: z.array(RadarMasternodeSchema),
})

export type RadarMasternodes = z.output<typeof RadarMasternodesSchema>
