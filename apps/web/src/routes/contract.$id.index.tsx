import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zDefault, zInt, zIsoDate, zOpt, zPage } from '@/app/search'
import { ContractPage } from '@/features/platform'

const defaults = { tab: 'overview', page: 1 } as const

const contractSearch = z.object({
  tab: zDefault(
    z.enum([
      'overview',
      'schema',
      'types',
      'tokens',
      'groups',
      'history',
      'config',
      'transactions',
      'documents',
    ]),
    defaults.tab,
  ),
  type: zOpt(z.string()),
  owner: zOpt(z.string()),
  page: zDefault(zPage, defaults.page),
  rev: zOpt(zInt),
  path: zOpt(z.string()),
  base: zOpt(zInt),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
})

export const Route = createFileRoute('/contract/$id/')({
  validateSearch: contractSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-data', 'contractPrefetch'),
  component: ContractPageRoute,
})

function ContractPageRoute() {
  const { id } = Route.useParams()
  return <ContractPage id={id} search={Route.useSearch()} />
}
