export type CoreTxType =
  | 'transfer'
  | 'coinbase'
  | 'pro-reg'
  | 'pro-up-serv'
  | 'pro-up-reg'
  | 'pro-up-rev'
  | 'quorum-commitment'
  | 'mnhf-signal'
  | 'asset-lock'
  | 'asset-unlock'

/** Every Platform state-transition type Platform Explorer names, in kebab case, plus `shielded` for the badge palette. */
export const TRANSITION_TYPES = [
  'data-contract-create',
  'data-contract-update',
  'batch',
  'identity-create',
  'identity-top-up',
  'identity-update',
  'identity-credit-transfer',
  'identity-credit-withdrawal',
  'identity-credit-transfer-to-address',
  'identity-create-from-addresses',
  'identity-top-up-from-addresses',
  'identity-key-limits-update',
  'masternode-vote',
  'address-funds-transfer',
  'address-funding-from-asset-lock',
  'address-credit-withdrawal',
  'shield',
  'shielded-transfer',
  'unshield',
  'shield-from-asset-lock',
  'shield-from-identity',
  'shielded-withdrawal',
  'identity-create-from-shielded-pool',
  'identity-top-up-from-shielded-pool',
  'contract-user-moderation',
  'contract-fee-claim',
  'token-shielded-transfer-with-shielded-fee',
  'token-unshield-with-shielded-fee',
  'token-purchase-from-shielded-pool',
  'shielded',
] as const

export type TransitionType = (typeof TRANSITION_TYPES)[number]

/** What one entry of a batch transition does: a document action or a token action. */
export const BATCH_TYPES = [
  'document-create',
  'document-replace',
  'document-delete',
  'document-transfer',
  'document-update-price',
  'document-purchase',
  'document-index-only-delete',
  'token-burn',
  'token-mint',
  'token-transfer',
  'token-freeze',
  'token-unfreeze',
  'token-destroy-frozen-funds',
  'token-claim',
  'token-emergency-action',
  'token-config-update',
  'token-direct-purchase',
  'token-set-price-for-direct-purchase',
  'token-shield',
  'token-mint-to-pool',
  'token-burn-from-pool',
  'token-claim-to-pool',
  'token-direct-purchase-to-pool',
  'token-unshield',
  'token-shielded-transfer',
] as const

export type BatchType = (typeof BATCH_TYPES)[number]
