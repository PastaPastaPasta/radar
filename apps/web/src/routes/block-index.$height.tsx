import { createFileRoute } from '@tanstack/react-router'
import { throwRedirect } from '@/app/redirect'

export const Route = createFileRoute('/block-index/$height')({
  beforeLoad: ({ params, search }) => {
    throwRedirect({ to: '/block/$id', params: { id: params.height } }, search.network)
  },
})
