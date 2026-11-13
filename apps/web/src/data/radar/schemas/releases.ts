import { z } from 'zod'
import { zIsoDate } from '../../zod'

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
