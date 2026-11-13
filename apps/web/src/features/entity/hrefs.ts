import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { EntityKind } from '@/ui'
import type { NetworkId } from '@/lib/network'
import { withNetwork, withSourceMode } from './network'

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
  return withSourceMode(withNetwork(entityPath(kind, id), net))
}

export const ENTITY_LABELS: Record<EntityKind, MessageDescriptor> = {
  block: msg`Core block`,
  tx: msg`Core transaction`,
  address: msg`Core address`,
  masternode: msg`Masternode`,
  evonode: msg`Evonode`,
  proposal: msg`Proposal`,
  'platform-block': msg`Platform block`,
  transition: msg`State transition`,
  identity: msg`Identity`,
  contract: msg`Contract`,
  document: msg`Document`,
  token: msg`Token`,
  name: msg`Name`,
  'platform-address': msg`Platform address`,
  epoch: msg`Epoch`,
  quorum: msg`Quorum`,
  group: msg`Group`,
  contest: msg`Name contest`,
}

/** The kind's name in the active language. */
export const entityLabel = (kind: EntityKind): string => i18n._(ENTITY_LABELS[kind])
