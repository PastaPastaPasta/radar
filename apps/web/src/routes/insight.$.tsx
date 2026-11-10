import { createFileRoute } from '@tanstack/react-router'
import { throwRedirect } from '@/app/redirect'

export const Route = createFileRoute('/insight/$')({
  beforeLoad: ({ params, search }) => {
    const [kind, id] = params._splat?.split('/').filter(Boolean) ?? []
    const go = (to: string, p?: Record<string, string>) => throwRedirect({ to, params: p }, search)
    if ((kind === 'block' || kind === 'block-index') && id) go('/block/$id', { id })
    if (kind === 'tx' && id) go('/tx/$txid', { txid: id })
    if (kind === 'address' && id) go('/address/$address', { address: id })
    if (kind === 'blocks') go('/blocks')
    go('/')
  },
})
