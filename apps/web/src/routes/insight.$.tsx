import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { throwRedirect } from '@/app/redirect'
import { zIsoDate } from '@/app/search'

const insightSearch = z.object({
  blockDate: zIsoDate.optional().catch(undefined),
})

export const Route = createFileRoute('/insight/$')({
  validateSearch: insightSearch,
  beforeLoad: ({ params, search }) => {
    const [kind, id] = params._splat?.split('/').filter(Boolean) ?? []
    const go = (to: string, p?: Record<string, string>, extra?: Record<string, unknown>) =>
      throwRedirect({ to, params: p, search: extra }, search)
    if ((kind === 'block' || kind === 'block-index') && id) go('/block/$id', { id })
    if (kind === 'tx' && id) go('/tx/$txid', { txid: id })
    if (kind === 'address' && id) go('/address/$address', { address: id })
    if (kind === 'blocks') go('/blocks', undefined, { date: search.blockDate })
    go('/')
  },
})
