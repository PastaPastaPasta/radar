import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { EntityKind } from '@/ui'
import type { NetworkId } from '@/lib/network'
import { withNetwork, withSourceMode } from './network'

const seg = encodeURIComponent

/** Search parameters an entity page reads besides the network, e.g. a contested name outside DPNS names its contract, type and index. */
export type EntitySearch = Readonly<Record<string, string | undefined>>

function withSearch(path: string, search: EntitySearch | undefined): string {
  const parts = Object.entries(search ?? {}).flatMap(([k, v]) =>
    v === undefined || v === '' ? [] : [`${seg(k)}=${seg(v)}`],
  )
  if (parts.length === 0) return path
  return `${path}${path.includes('?') ? '&' : '?'}${parts.join('&')}`
}

/**
 * `id` is the last path segment; for compound kinds (document, group) it is `a/b/c` as the route expects.
 * `search` adds query parameters after the quorum's own `q`.
 */
export function entityPath(kind: EntityKind, id: string, search?: EntitySearch): string {
  return withSearch(basePath(kind, id), search)
}

function basePath(kind: EntityKind, id: string): string {
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

export function entityHref(
  kind: EntityKind,
  id: string,
  net: NetworkId,
  search?: EntitySearch,
): string {
  return withSourceMode(withNetwork(entityPath(kind, id, search), net))
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
