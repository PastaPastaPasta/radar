import { createFileRoute } from '@tanstack/react-router'
import { throwRedirect } from '@/app/redirect'

export const Route = createFileRoute('/validators')({
  beforeLoad: ({ search }) => {
    throwRedirect({ to: '/masternodes', search: { type: 'evo', view: 'platform' } }, search.network)
  },
})
