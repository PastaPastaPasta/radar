import { z } from 'zod'
import { seconds } from './common'

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
