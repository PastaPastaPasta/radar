import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { CoreTxType, TransitionType } from '@/lib/tx-types'
import type { IconName } from './icon-paths'
import type { EntityKind, Layer } from './types'

export interface KindMeta {
  label: MessageDescriptor
  layer: Layer
  icon: IconName
}

export const KIND_META: Record<EntityKind, KindMeta> = {
  block: { label: msg`Core block`, layer: 'core', icon: 'block' },
  tx: { label: msg`Core transaction`, layer: 'core', icon: 'tx' },
  address: { label: msg`Core address`, layer: 'core', icon: 'addr' },
  masternode: { label: msg`Masternode`, layer: 'network', icon: 'node' },
  evonode: { label: msg`Evonode`, layer: 'network', icon: 'node' },
  proposal: { label: msg`Governance proposal`, layer: 'network', icon: 'vote' },
  'platform-block': { label: msg`Platform block`, layer: 'platform', icon: 'plat' },
  transition: { label: msg`State transition`, layer: 'platform', icon: 'doc' },
  identity: { label: msg`Identity`, layer: 'platform', icon: 'id' },
  contract: { label: msg`Data contract`, layer: 'platform', icon: 'contract' },
  document: { label: msg`Document`, layer: 'platform', icon: 'doc' },
  token: { label: msg`Token`, layer: 'platform', icon: 'token' },
  name: { label: msg`Username`, layer: 'platform', icon: 'name' },
  'platform-address': { label: msg`Platform address`, layer: 'platform', icon: 'addr' },
  epoch: { label: msg`Epoch`, layer: 'platform', icon: 'epoch' },
  quorum: { label: msg`Quorum`, layer: 'network', icon: 'quorum' },
  group: { label: msg`Group`, layer: 'platform', icon: 'key' },
  contest: { label: msg`Contested name`, layer: 'platform', icon: 'vote' },
}

export const TYPE_META: Record<CoreTxType | TransitionType, KindMeta> = {
  transfer: { label: msg`Payment`, layer: 'core', icon: 'tx' },
  coinbase: { label: msg`Coinbase`, layer: 'core', icon: 'coin' },
  'asset-lock': { label: msg`Asset lock`, layer: 'core', icon: 'cl' },
  'asset-unlock': { label: msg`Asset unlock`, layer: 'core', icon: 'cl' },
  'pro-reg': { label: msg`ProRegTx`, layer: 'network', icon: 'node' },
  'pro-up-serv': { label: msg`ProUpServTx`, layer: 'network', icon: 'node' },
  'pro-up-reg': { label: msg`ProUpRegTx`, layer: 'network', icon: 'node' },
  'pro-up-rev': { label: msg`ProUpRevTx`, layer: 'network', icon: 'node' },
  'quorum-commitment': { label: msg`Quorum commitment`, layer: 'network', icon: 'quorum' },
  'mnhf-signal': { label: msg`MnHF signal`, layer: 'network', icon: 'flag' },
  'identity-create': { label: msg`Identity create`, layer: 'platform', icon: 'plus' },
  'identity-top-up': { label: msg`Identity top-up`, layer: 'platform', icon: 'plus' },
  'identity-update': { label: msg`Identity update`, layer: 'platform', icon: 'id' },
  'identity-credit-transfer': { label: msg`Credit transfer`, layer: 'platform', icon: 'swap' },
  'identity-credit-withdrawal': { label: msg`Credit withdrawal`, layer: 'core', icon: 'up' },
  'data-contract-create': { label: msg`Contract create`, layer: 'platform', icon: 'cube2' },
  'data-contract-update': { label: msg`Contract update`, layer: 'platform', icon: 'cube2' },
  batch: { label: msg`Document batch`, layer: 'platform', icon: 'doc' },
  'masternode-vote': { label: msg`Masternode vote`, layer: 'network', icon: 'vote' },
  'address-funds-transfer': { label: msg`Address transfer`, layer: 'platform', icon: 'swap' },
  'address-funding-from-asset-lock': { label: msg`Address funding`, layer: 'core', icon: 'cl' },
  'address-credit-withdrawal': { label: msg`Address withdrawal`, layer: 'core', icon: 'up' },
  shielded: { label: msg`Shielded`, layer: 'platform', icon: 'shield' },
}

export function typeMeta(type: string): KindMeta {
  return (
    (TYPE_META as Record<string, KindMeta | undefined>)[type] ?? {
      label: { id: type },
      layer: 'neutral',
      icon: 'doc',
    }
  )
}

/** A kind's or type's name in the active language. */
export const labelOf = (meta: KindMeta): string => i18n._(meta.label)
