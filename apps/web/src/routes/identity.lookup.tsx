import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zHex40, zOpt } from '@/app/search'
import { IdentityLookupPage } from '@/features/platform'

const identityLookupSearch = z.object({
  pkh: zOpt(zHex40),
  after: zOpt(z.string()),
})

export const Route = createFileRoute('/identity/lookup')({
  validateSearch: identityLookupSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('p-id', 'identityLookupPrefetch'),
  component: IdentityLookupRoute,
})

function IdentityLookupRoute() {
  const { pkh, after } = Route.useSearch()
  return <IdentityLookupPage pkh={pkh} after={after} />
}
