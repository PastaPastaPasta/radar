import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zCsv, zCsvEnum, zDefault, zIsoDate, zOpt, zPage, zRange } from '@/app/search'
import { IdentityPage } from '@/features/platform'
import { TRANSITION_TYPES } from '@/lib/tx-types'

const defaults = { tab: 'overview', page: 1 } as const

const identitySearch = z.object({
  tab: zDefault(
    z.enum([
      'overview',
      'keys',
      'names',
      'tokens',
      'groups',
      'votes',
      'transactions',
      'contracts',
      'documents',
      'transfers',
      'advanced',
    ]),
    defaults.tab,
  ),
  page: zDefault(zPage, defaults.page),
  contract: zOpt(z.string()),
  type: zOpt(z.string()),
  tokens: zOpt(zCsv),
  txtype: zOpt(zCsvEnum(TRANSITION_TYPES)),
  batch: zOpt(zCsv),
  status: zOpt(z.enum(['success', 'fail'])),
  gas: zOpt(zRange),
  from: zOpt(zIsoDate),
  to: zOpt(zIsoDate),
})

export const Route = createFileRoute('/identity/$id')({
  validateSearch: identitySearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-id', 'identityPrefetch'),
  component: IdentityPageRoute,
})

function IdentityPageRoute() {
  const { id } = Route.useParams()
  const search = Route.useSearch()
  return <IdentityPage id={id} search={search} />
}
