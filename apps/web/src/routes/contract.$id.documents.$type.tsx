import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zLimitOf, zList, zOpt, zWhere } from '@/app/search'
import { DocumentsPage } from '@/features/platform'

const defaults = { limit: 25 } as const

const contractDocumentsSearch = z.object({
  where: zOpt(zWhere),
  order: zOpt(zList),
  limit: zDefault(zLimitOf([10, 25, 50, 100]), defaults.limit),
  after: zOpt(z.string()),
  prev: zOpt(zList),
})

export const Route = createFileRoute('/contract/$id/documents/$type')({
  validateSearch: contractDocumentsSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-data', 'contractDocumentsPrefetch'),
  component: DocumentsPageRoute,
})

function DocumentsPageRoute() {
  const { id, type } = Route.useParams()
  return <DocumentsPage id={id} type={type} search={Route.useSearch()} />
}
