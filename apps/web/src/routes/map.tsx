import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zDefault, zHex64, zOpt } from '@/app/search'
import { mnFilterSearch } from '@/data/masternodes/filter'
import { MapPage } from '@/features/network'

const defaults = { layer: 'mn' } as const

/**
 * `color` and `hide` come from links to the old map, which coloured its points and hid categories of them: the page
 * turns them into the filter they meant and drops them.
 */
const mapSearch = mnFilterSearch.extend({
  layer: zDefault(z.enum(['mn', 'nodes']), defaults.layer),
  place: zOpt(z.string().max(200)),
  region: zOpt(z.enum(['europe', 'americas', 'asia'])),
  protx: zOpt(zHex64),
  color: zOpt(z.enum(['reach', 'pose', 'version', 'type'])),
  hide: zOpt(zCsv),
})

export const Route = createFileRoute('/map')({
  validateSearch: mapSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('net-d', 'mapPrefetch'),
  component: MapPage,
})
