import { useQuery } from '@tanstack/react-query'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { useNetwork } from '@/features/entity'
import { readIdentityText } from './identity-input'

export type Who =
  | { state: 'none' }
  | { state: 'invalid' }
  | { state: 'resolving'; name: string }
  | { state: 'not-found'; name: string }
  | { state: 'error'; name: string; retry: () => void }
  | { state: 'ready'; id: string; name?: string; stamp?: SourceStamp }

/** The identity the `who` search value names: an ID at once, a DPNS name after DPNS has answered. */
export function useWho(raw: string | undefined): Who {
  const net = useNetwork()
  const read = raw === undefined ? undefined : readIdentityText(raw)
  const name = read?.kind === 'name' ? read.name : ''
  const query = useQuery({
    ...sdkQueries['dpns.resolveName'](net, { name }),
    enabled: name !== '',
  })
  if (read === undefined) return { state: 'none' }
  if (read.kind === 'invalid') return { state: 'invalid' }
  if (read.kind === 'id') return { state: 'ready', id: read.id }
  if (query.isPending) return { state: 'resolving', name }
  if (query.isError) return { state: 'error', name, retry: () => void query.refetch() }
  return query.data.data
    ? { state: 'ready', id: query.data.data, name, stamp: stampOf(query.data) }
    : { state: 'not-found', name }
}
