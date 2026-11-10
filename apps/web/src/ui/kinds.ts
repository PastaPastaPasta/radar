import type { CoreTxType, TransitionType } from '@/lib/tx-types'
import type { IconName } from './icon-paths'
import type { EntityKind, Layer } from './types'

export interface KindMeta {
  label: string
  layer: Layer
  icon: IconName
}

export const KIND_META: Record<EntityKind, KindMeta> = {
  block: { label: 'Core block', layer: 'core', icon: 'block' },
  tx: { label: 'Core transaction', layer: 'core', icon: 'tx' },
  address: { label: 'Core address', layer: 'core', icon: 'addr' },
  masternode: { label: 'Masternode', layer: 'network', icon: 'node' },
  evonode: { label: 'Evonode', layer: 'network', icon: 'node' },
  proposal: { label: 'Governance proposal', layer: 'network', icon: 'vote' },
  'platform-block': { label: 'Platform block', layer: 'platform', icon: 'plat' },
  transition: { label: 'State transition', layer: 'platform', icon: 'doc' },
  identity: { label: 'Identity', layer: 'platform', icon: 'id' },
  contract: { label: 'Data contract', layer: 'platform', icon: 'contract' },
  document: { label: 'Document', layer: 'platform', icon: 'doc' },
  token: { label: 'Token', layer: 'platform', icon: 'token' },
  name: { label: 'Username', layer: 'platform', icon: 'name' },
  'platform-address': { label: 'Platform address', layer: 'platform', icon: 'addr' },
  epoch: { label: 'Epoch', layer: 'platform', icon: 'epoch' },
  quorum: { label: 'Quorum', layer: 'network', icon: 'quorum' },
  group: { label: 'Group', layer: 'platform', icon: 'key' },
  contest: { label: 'Contested name', layer: 'platform', icon: 'vote' },
}

export const TYPE_META: Record<CoreTxType | TransitionType, KindMeta> = {
  transfer: { label: 'Payment', layer: 'core', icon: 'tx' },
  coinbase: { label: 'Coinbase', layer: 'core', icon: 'coin' },
  'asset-lock': { label: 'Asset lock', layer: 'core', icon: 'cl' },
  'asset-unlock': { label: 'Asset unlock', layer: 'core', icon: 'cl' },
  'pro-reg': { label: 'ProRegTx', layer: 'network', icon: 'node' },
  'pro-up-serv': { label: 'ProUpServTx', layer: 'network', icon: 'node' },
  'pro-up-reg': { label: 'ProUpRegTx', layer: 'network', icon: 'node' },
  'pro-up-rev': { label: 'ProUpRevTx', layer: 'network', icon: 'node' },
  'quorum-commitment': { label: 'Quorum commitment', layer: 'network', icon: 'quorum' },
  'mnhf-signal': { label: 'MnHF signal', layer: 'network', icon: 'flag' },
  'identity-create': { label: 'Identity create', layer: 'platform', icon: 'plus' },
  'identity-top-up': { label: 'Identity top-up', layer: 'platform', icon: 'plus' },
  'identity-update': { label: 'Identity update', layer: 'platform', icon: 'id' },
  'identity-credit-transfer': { label: 'Credit transfer', layer: 'platform', icon: 'swap' },
  'identity-credit-withdrawal': { label: 'Credit withdrawal', layer: 'core', icon: 'up' },
  'data-contract-create': { label: 'Contract create', layer: 'platform', icon: 'cube2' },
  'data-contract-update': { label: 'Contract update', layer: 'platform', icon: 'cube2' },
  batch: { label: 'Document batch', layer: 'platform', icon: 'doc' },
  'masternode-vote': { label: 'Masternode vote', layer: 'network', icon: 'vote' },
  'address-funds-transfer': { label: 'Address transfer', layer: 'platform', icon: 'swap' },
  'address-funding-from-asset-lock': { label: 'Address funding', layer: 'core', icon: 'cl' },
  'address-credit-withdrawal': { label: 'Address withdrawal', layer: 'core', icon: 'up' },
  shielded: { label: 'Shielded', layer: 'platform', icon: 'shield' },
}

export function typeMeta(type: string): KindMeta {
  return (
    (TYPE_META as Record<string, KindMeta | undefined>)[type] ?? {
      label: type,
      layer: 'neutral',
      icon: 'doc',
    }
  )
}
