import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zDefault, zHex64, zOpt } from '@/app/search'
import { mnFilterSearch } from '@/data/masternodes/filter'
import { MapPage } from '@/features/network'

const defaults = { layer: 'mn', color: 'reach' } as const

const mapSearch = mnFilterSearch.extend({
  layer: zDefault(z.enum(['mn', 'nodes']), defaults.layer),
  color: zDefault(z.enum(['reach', 'pose', 'version', 'type']), defaults.color),
  hide: zOpt(zCsv),
  protx: zOpt(zHex64),
})

export const Route = createFileRoute('/map')({
  validateSearch: mapSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-d', 'mapPrefetch'),
  component: MapPage,
})
