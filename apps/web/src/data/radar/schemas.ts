import { z } from 'zod'
import { zBigint, zHex64, zIsoDate, zUnixSeconds } from '../zod'

const seconds = zUnixSeconds
const secondsOrNull = zUnixSeconds.nullable()

export const RadarNetworkStatusSchema = z.object({
  chain: z.object({
    blocks: z.number(),
    headers: z.number(),
    best_block_time: seconds,
    dashd_version: z.string(),
    synced: z.boolean(),
    updated: seconds,
    error: z.string().nullable(),
    verification_progress: z.number(),
  }),
  crawl: z.object({
    last_id: z.number().nullable(),
    last_finished: secondsOrNull,
    last_error: z.string().nullable(),
    running: z.boolean(),
  }),
  geo_loaded: z.boolean(),
  payments_indexed: z.object({ from: z.number(), to: z.number() }).nullish(),
})
export type RadarNetworkStatus = z.output<typeof RadarNetworkStatusSchema>

export const RadarStatusSchema = z.object({
  crawler_location: z.string().nullish(),
  networks: z.object({
    mainnet: RadarNetworkStatusSchema,
    testnet: RadarNetworkStatusSchema,
  }),
  snapshots: z
    .record(z.string(), z.object({ saved: secondsOrNull, error: z.string().nullable() }))
    .optional(),
  version: z.string().optional(),
})
export type RadarStatus = z.output<typeof RadarStatusSchema>

export const RadarHealthSchema = z.object({
  ok: z.boolean(),
  age_secs: z
    .record(z.string(), z.object({ crawl: z.number().nullish(), chain: z.number().nullish() }))
    .optional(),
  problems: z.array(z.string()).optional(),
})
export type RadarHealth = z.output<typeof RadarHealthSchema>

export const RadarReleasesSchema = z.object({
  releases: z.array(
    z.object({
      tag: z.string(),
      version: z.string(),
      prerelease: z.boolean(),
      published: zIsoDate,
    }),
  ),
})
export type RadarReleases = z.output<typeof RadarReleasesSchema>

const RadarCrawlSchema = z.object({
  id: z.number(),
  started: seconds,
  finished: seconds,
  tip_height: z.number(),
  tried: z.number(),
  discovered: z.number(),
  reachable: z.number(),
  mn_total: z.number(),
  mn_reachable: z.number(),
})

const RadarDistEntrySchema = z.tuple([z.string(), z.number()])
export const RADAR_SCOPES = ['all', 'mn', 'evo', 'nonmn'] as const
export type RadarScope = (typeof RADAR_SCOPES)[number]

export const RADAR_DIMS = [
  'totals',
  'ua',
  'version',
  'client',
  'protocol',
  'country',
  'asn',
  'reachable',
  'status',
  'type',
  'network',
] as const
export type RadarDim = (typeof RADAR_DIMS)[number]

const DistSchema = z.record(z.string(), z.array(RadarDistEntrySchema))

const DkgCheckSchema = z.object({
  pass: z.number(),
  fail: z.number(),
  unknown: z.number(),
})

const RadarVersionCountsSchema = z.array(z.tuple([z.string(), z.number()]))

export const RadarSummarySchema = z.object({
  crawl: RadarCrawlSchema,
  day_ago: RadarCrawlSchema.nullish(),
  dists: z.record(z.string(), DistSchema),
  networks: z.array(
    z.object({
      network: z.string(),
      crawled: z.boolean(),
      known: z.number(),
      tried: z.number(),
      reachable: z.number(),
      masternodes: z.number(),
      reason: z.string().nullable(),
    }),
  ),
  dkg_readiness: z
    .object({
      masternodes: z.number(),
      overall: DkgCheckSchema,
      beyond_version: z.number().optional(),
      version_only: z.number().optional(),
      checks: z.record(z.string(), DkgCheckSchema),
      rules: z.record(z.string(), z.unknown()).optional(),
    })
    .nullish(),
  returns: z
    .object({
      window_days: z.number(),
      regular: z
        .object({
          masternodes: z.number(),
          median_annual_yield: z.number().nullish(),
        })
        .nullish(),
      evo: z
        .object({
          masternodes: z.number(),
          median_annual_yield: z.number().nullish(),
          median_platform_yield: z.number().nullish(),
          median_total_yield: z.number().nullish(),
          platform_span_days: z.number().nullish(),
        })
        .nullish(),
    })
    .nullish(),
  platform: z
    .object({
      checked: z.number(),
      healthy: z.number(),
      https_ok: z.number(),
      p2p_ok: z.number(),
      cert_expiring_3d: z.number(),
      max_height: z.number().nullish(),
      updated: seconds,
      dapi: RadarVersionCountsSchema,
      drive: RadarVersionCountsSchema,
      tenderdash: RadarVersionCountsSchema,
    })
    .nullish(),
})
export type RadarSummary = z.output<typeof RadarSummarySchema>

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

export const RadarGeoSchema = z.object({
  crawl_id: z.number().nullish(),
  points: z.array(
    z.object({
      lat: z.number(),
      lon: z.number(),
      city: z.string().nullable(),
      country: z.string().nullable(),
      nodes: z.number(),
      masternodes: z.number(),
    }),
  ),
  unlocated: z.number(),
})
export type RadarGeo = z.output<typeof RadarGeoSchema>

const DkgReadinessSchema = z.object({
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

export const RadarPaymentSchema = z.object({
  height: z.number(),
  time: seconds,
  amount_duffs: zBigint,
  block_hash: zHex64,
})
export type RadarPayment = z.output<typeof RadarPaymentSchema>

export const RadarPaymentsSchema = z.object({ payments: z.array(RadarPaymentSchema) })

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

const BenchGradeSchema = z.object({
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

export const RadarChangesSchema = z.object({
  since: seconds,
  changes: z.array(RadarChangeSchema),
})
export type RadarChanges = z.output<typeof RadarChangesSchema>

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
