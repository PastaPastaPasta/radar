import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { IdentityLookupPage } from '@/features/platform'

export const lookupSearch = z.object({
  pkh: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/identity/lookup')({
  validateSearch: lookupSearch,
  component: IdentityLookupRoute,
})

function IdentityLookupRoute() {
  return <IdentityLookupPage />
}
