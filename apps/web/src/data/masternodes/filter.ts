import { z } from 'zod'
import { zCsv, zCsvEnum, zOpt } from '@/lib/search-schemas'

/** The masternode filter fields the list (`/masternodes`) and the map (`/map`) share, in the URL's string forms. */
export const mnFilterSearch = z.object({
  q: zOpt(z.string()),
  type: zOpt(zCsvEnum(['regular', 'evo'])),
  status: zOpt(zCsvEnum(['enabled', 'pose-banned'])),
  reach: zOpt(z.enum(['reachable', 'unreachable'])),
  country: zOpt(zCsv),
  version: zOpt(zCsv),
  host: zOpt(zCsv),
  dkg: zOpt(zCsv),
})

export type MnFilter = z.output<typeof mnFilterSearch>
