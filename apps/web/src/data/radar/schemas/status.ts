import { z } from 'zod'
import { seconds, secondsOrNull } from './common'

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
