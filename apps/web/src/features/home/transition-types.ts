import type { TransitionType } from '@/lib/tx-types'

export interface TransitionKind {
  type: TransitionType
  label: string
}

const WORDS: Record<string, string> = { top: 'top-up' }

function humanize(raw: string): string {
  const text = raw
    .toLowerCase()
    .split('_')
    .map((w) => WORDS[w] ?? w)
    .join(' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const SIMPLE: Record<string, TransitionType> = {
  DATA_CONTRACT_CREATE: 'data-contract-create',
  DATA_CONTRACT_UPDATE: 'data-contract-update',
  IDENTITY_CREATE: 'identity-create',
  IDENTITY_TOP_UP: 'identity-top-up',
  IDENTITY_UPDATE: 'identity-update',
  IDENTITY_CREDIT_TRANSFER: 'identity-credit-transfer',
  IDENTITY_CREDIT_WITHDRAWAL: 'identity-credit-withdrawal',
  MASTERNODE_VOTE: 'masternode-vote',
  ADDRESS_FUNDS_TRANSFER: 'address-funds-transfer',
  ADDRESS_FUNDING_FROM_ASSET_LOCK: 'address-funding-from-asset-lock',
  ADDRESS_CREDIT_WITHDRAWAL: 'address-credit-withdrawal',
}

/** Platform Explorer's transition type and batch type as the badge palette and a plain label. */
export function transitionKind(type: string, batchType?: string | number | null): TransitionKind {
  const known = SIMPLE[type]
  if (known) return { type: known, label: humanize(type) }
  if (type === 'BATCH') {
    return { type: 'batch', label: batchType ? humanize(String(batchType)) : 'Batch' }
  }
  if (type.startsWith('SHIELD')) return { type: 'shielded', label: humanize(type) }
  return { type: 'batch', label: humanize(type) }
}
