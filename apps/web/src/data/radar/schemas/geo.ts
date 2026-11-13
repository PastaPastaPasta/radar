import { z } from 'zod'

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
