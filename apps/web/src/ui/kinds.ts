import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { BatchType, CoreTxType, TransitionType } from '@/lib/tx-types'
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

export const TYPE_META: Record<CoreTxType | TransitionType | BatchType, KindMeta> = {
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
  'identity-credit-transfer-to-address': {
    label: msg`Transfer to address`,
    layer: 'platform',
    icon: 'swap',
  },
  'identity-create-from-addresses': {
    label: msg`Identity create from addresses`,
    layer: 'platform',
    icon: 'plus',
  },
  'identity-top-up-from-addresses': {
    label: msg`Identity top-up from addresses`,
    layer: 'platform',
    icon: 'plus',
  },
  'identity-key-limits-update': { label: msg`Key limits update`, layer: 'platform', icon: 'key' },
  shield: { label: msg`Shield`, layer: 'platform', icon: 'shield' },
  'shielded-transfer': { label: msg`Shielded transfer`, layer: 'platform', icon: 'shield' },
  unshield: { label: msg`Unshield`, layer: 'platform', icon: 'shield' },
  'shield-from-asset-lock': { label: msg`Shield from asset lock`, layer: 'core', icon: 'shield' },
  'shield-from-identity': { label: msg`Shield from identity`, layer: 'platform', icon: 'shield' },
  'shielded-withdrawal': { label: msg`Shielded withdrawal`, layer: 'core', icon: 'shield' },
  'identity-create-from-shielded-pool': {
    label: msg`Identity create from pool`,
    layer: 'platform',
    icon: 'shield',
  },
  'identity-top-up-from-shielded-pool': {
    label: msg`Identity top-up from pool`,
    layer: 'platform',
    icon: 'shield',
  },
  'contract-user-moderation': {
    label: msg`Contract moderation`,
    layer: 'platform',
    icon: 'contract',
  },
  'contract-fee-claim': { label: msg`Contract fee claim`, layer: 'platform', icon: 'contract' },
  'token-shielded-transfer-with-shielded-fee': {
    label: msg`Token shielded transfer`,
    layer: 'platform',
    icon: 'token',
  },
  'token-unshield-with-shielded-fee': {
    label: msg`Token unshield`,
    layer: 'platform',
    icon: 'token',
  },
  'token-purchase-from-shielded-pool': {
    label: msg`Token purchase from pool`,
    layer: 'platform',
    icon: 'token',
  },
  'document-create': { label: msg`Document create`, layer: 'platform', icon: 'doc' },
  'document-replace': { label: msg`Document replace`, layer: 'platform', icon: 'edit' },
  'document-delete': { label: msg`Document delete`, layer: 'platform', icon: 'x' },
  'document-transfer': { label: msg`Document transfer`, layer: 'platform', icon: 'swap' },
  'document-update-price': { label: msg`Document price`, layer: 'platform', icon: 'coin' },
  'document-purchase': { label: msg`Document purchase`, layer: 'platform', icon: 'coin' },
  'document-index-only-delete': { label: msg`Document index delete`, layer: 'platform', icon: 'x' },
  'token-burn': { label: msg`Token burn`, layer: 'platform', icon: 'token' },
  'token-mint': { label: msg`Token mint`, layer: 'platform', icon: 'token' },
  'token-transfer': { label: msg`Token transfer`, layer: 'platform', icon: 'swap' },
  'token-freeze': { label: msg`Token freeze`, layer: 'platform', icon: 'pause' },
  'token-unfreeze': { label: msg`Token unfreeze`, layer: 'platform', icon: 'play' },
  'token-destroy-frozen-funds': { label: msg`Destroy frozen funds`, layer: 'platform', icon: 'x' },
  'token-claim': { label: msg`Token claim`, layer: 'platform', icon: 'token' },
  'token-emergency-action': {
    label: msg`Token emergency action`,
    layer: 'platform',
    icon: 'alert',
  },
  'token-config-update': { label: msg`Token config update`, layer: 'platform', icon: 'edit' },
  'token-direct-purchase': { label: msg`Token purchase`, layer: 'platform', icon: 'coin' },
  'token-set-price-for-direct-purchase': {
    label: msg`Token price`,
    layer: 'platform',
    icon: 'coin',
  },
  'token-shield': { label: msg`Token shield`, layer: 'platform', icon: 'shield' },
  'token-mint-to-pool': { label: msg`Token mint to pool`, layer: 'platform', icon: 'shield' },
  'token-burn-from-pool': { label: msg`Token burn from pool`, layer: 'platform', icon: 'shield' },
  'token-claim-to-pool': { label: msg`Token claim to pool`, layer: 'platform', icon: 'shield' },
  'token-direct-purchase-to-pool': {
    label: msg`Token purchase to pool`,
    layer: 'platform',
    icon: 'shield',
  },
  'token-unshield': { label: msg`Token unshield`, layer: 'platform', icon: 'shield' },
  'token-shielded-transfer': {
    label: msg`Token shielded transfer`,
    layer: 'platform',
    icon: 'shield',
  },
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
