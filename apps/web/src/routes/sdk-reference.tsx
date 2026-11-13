import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { routePrefetch } from '@/app/route-loader'
import { zOpt } from '@/app/search'
import { SdkReferencePage } from '@/features/tools'

const sdkReferenceSearch = z.object({
  q: zOpt(z.string()),
})

export const Route = createFileRoute('/sdk-reference')({
  validateSearch: sdkReferenceSearch,
  loaderDeps: ({ search }) => search,
  loader: routePrefetch('tools', 'sdkReferencePrefetch'),
  component: SdkReferencePage,
})
