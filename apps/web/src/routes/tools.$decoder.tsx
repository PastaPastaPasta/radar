import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zOpt } from '@/app/search'
import { DecoderPage } from '@/features/tools'

const decoderSearch = z.object({
  contract: zOpt(z.string()),
  type: zOpt(z.string()),
  preset: zOpt(z.string()),
})

export const Route = createFileRoute('/tools/$decoder')({
  validateSearch: decoderSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch(
    () => import('@/data/query/prefetch/tools'),
    (m) => m.decoderPrefetch,
  ),
  component: DecoderPageRoute,
})

function DecoderPageRoute() {
  const { decoder } = Route.useParams()
  return <DecoderPage decoder={decoder} />
}
