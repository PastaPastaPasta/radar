import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { zCsv, zCsvEnum } from '@/app/search'
import { MasternodesPage } from '@/features/network'

const defaults = { sort: '-status', view: 'list' } as const

const masternodesSearch = z.object({
  q: z.string().optional().catch(undefined),
  type: zCsvEnum(['regular', 'evo']).optional().catch(undefined),
  status: zCsvEnum(['enabled', 'pose-banned']).optional().catch(undefined),
  reach: z.enum(['reachable', 'unreachable']).optional().catch(undefined),
  country: zCsv.optional().catch(undefined),
  sort: z.string().default(defaults.sort).catch(defaults.sort),
  view: z.enum(['list', 'platform']).default(defaults.view).catch(defaults.view),
})

export const Route = createFileRoute('/masternodes')({
  validateSearch: masternodesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  component: MasternodesPage,
})
