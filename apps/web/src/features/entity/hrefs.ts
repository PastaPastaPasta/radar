import type { EntityKind } from '@/ui'
import type { NetworkId } from '@/lib/network'
import { withNetwork } from './network'

const seg = encodeURIComponent

/** `id` is the last path segment; for compound kinds (document, group) it is `a/b/c` as the route expects. */
export function entityPath(kind: EntityKind, id: string): string {
  const tail = id.split('/').map(seg).join('/')
  switch (kind) {
    case 'block':
      return `/block/${tail}`
    case 'tx':
      return `/tx/${tail}`
    case 'address':
      return `/address/${tail}`
    case 'masternode':
    case 'evonode':
      return `/mn/${tail}`
    case 'proposal':
      return `/governance/${tail}`
    case 'platform-block':
      return `/platform/block/${tail}`
    case 'transition':
      return `/platform/tx/${tail}`
    case 'identity':
      return `/identity/${tail}`
    case 'contract':
      return `/contract/${tail}`
    case 'document':
      return `/document/${tail}`
    case 'token':
      return `/token/${tail}`
    case 'name':
      return `/name/${tail}`
    case 'platform-address':
      return `/platform-address/${tail}`
    case 'epoch':
      return `/epoch/${tail}`
    case 'quorum':
      return `/quorums?q=${seg(id)}`
    case 'group':
      return `/group/${tail}`
    case 'contest':
      return `/contest/${tail}`
  }
}

export function entityHref(kind: EntityKind, id: string, net: NetworkId): string {
  return withNetwork(entityPath(kind, id), net)
}

export const ENTITY_LABELS: Record<EntityKind, string> = {
  block: 'Core block',
  tx: 'Core transaction',
  address: 'Core address',
  masternode: 'Masternode',
  evonode: 'Evonode',
  proposal: 'Proposal',
  'platform-block': 'Platform block',
  transition: 'State transition',
  identity: 'Identity',
  contract: 'Contract',
  document: 'Document',
  token: 'Token',
  name: 'Name',
  'platform-address': 'Platform address',
  epoch: 'Epoch',
  quorum: 'Quorum',
  group: 'Group',
  contest: 'Name contest',
}
