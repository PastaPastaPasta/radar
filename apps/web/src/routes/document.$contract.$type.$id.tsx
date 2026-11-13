import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zPage } from '@/app/search'
import { DocumentPage } from '@/features/platform'

const defaults = { tab: 'data', page: 1 } as const

const documentSearch = z.object({
  tab: zDefault(z.enum(['data', 'meta', 'revisions', 'provenance']), defaults.tab),
  page: zDefault(zPage, defaults.page),
})

export const Route = createFileRoute('/document/$contract/$type/$id')({
  validateSearch: documentSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-data', 'documentPrefetch'),
  component: DocumentPageRoute,
})

function DocumentPageRoute() {
  const { contract, type, id } = Route.useParams()
  return <DocumentPage contract={contract} type={type} id={id} search={Route.useSearch()} />
}
