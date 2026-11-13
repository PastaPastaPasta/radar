import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zPage } from '@/app/search'
import { mnFilterSearch } from '@/data/masternodes/filter'
import { MasternodesPage } from '@/features/network'

const defaults = { sort: '-status', view: 'list', pf: 'all', page: 1 } as const

const masternodesSearch = mnFilterSearch.extend({
  sort: zDefault(z.string(), defaults.sort),
  view: zDefault(z.enum(['list', 'platform']), defaults.view),
  pf: zDefault(z.enum(['all', 'proposed', 'not-in-set', 'vote-not-counted']), defaults.pf),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/masternodes')({
  validateSearch: masternodesSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-b', 'masternodesPrefetch'),
  component: MasternodesPage,
})
