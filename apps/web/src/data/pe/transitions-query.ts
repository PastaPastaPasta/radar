import type { PeQuery } from './params'
import type { NumericRange } from '@/lib/search-schemas'
import { TRANSITION_TYPES, type TransitionType } from '@/lib/tx-types'
import { dayEnd, dayStart } from './blocks-query'

export interface TxsSearch {
  page: number
  limit: number
  type?: TransitionType[] | undefined
  batch?: string[] | undefined
  status?: 'success' | 'fail' | undefined
  gas?: NumericRange | undefined
  owner?: string | undefined
  from?: string | undefined
  to?: string | undefined
  sort: string
}

/** PE numbers its transition types in this order (its `StateTransitionEnum`), which is not the order of `TRANSITION_TYPES`. */
const PE_TYPE_ORDER = [
  'data-contract-create',
  'batch',
  'identity-create',
  'identity-top-up',
  'data-contract-update',
  'identity-update',
  'identity-credit-withdrawal',
  'identity-credit-transfer',
  'masternode-vote',
  'identity-credit-transfer-to-address',
  'identity-create-from-addresses',
  'identity-top-up-from-addresses',
  'address-funds-transfer',
  'address-funding-from-asset-lock',
  'address-credit-withdrawal',
  'shield',
  'shielded-transfer',
  'unshield',
  'shield-from-asset-lock',
  'shielded-withdrawal',
  'identity-create-from-shielded-pool',
  'shield-from-identity',
  'identity-top-up-from-shielded-pool',
  'identity-key-limits-update',
  'contract-user-moderation',
  'contract-fee-claim',
  'token-shielded-transfer-with-shielded-fee',
  'token-unshield-with-shielded-fee',
  'token-purchase-from-shielded-pool',
] as const satisfies readonly TransitionType[]

/** PE's batch sub-type numbers (its `BatchEnum`). */
const PE_BATCH_ORDER = [
  'document-create',
  'document-replace',
  'document-delete',
  'document-transfer',
  'document-update-price',
  'document-purchase',
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
  'document-index-only-delete',
  'token-shield',
  'token-mint-to-pool',
  'token-burn-from-pool',
  'token-claim-to-pool',
  'token-direct-purchase-to-pool',
  'token-unshield',
  'token-shielded-transfer',
] as const

export const peTypeNumber = (type: string): number | undefined => {
  const n = (PE_TYPE_ORDER as readonly string[]).indexOf(type)
  return n < 0 ? undefined : n
}

export const peBatchNumber = (type: string): number | undefined => {
  const n = (PE_BATCH_ORDER as readonly string[]).indexOf(type)
  return n < 0 ? undefined : n
}

/** Every type this build can filter by: the ones PE numbers. */
export const FILTER_TYPES: readonly TransitionType[] = TRANSITION_TYPES.filter(
  (t) => peTypeNumber(t) !== undefined,
)

const SORT_FIELD: Record<string, string> = { time: 'timestamp', gas: 'gas_used', owner: 'owner' }

/** The `orderBy` and `order` Explorer takes for a `sort` value such as `-time` or `gas`. */
export function txOrder(sort: string): { orderBy: string; order: 'asc' | 'desc' } {
  const desc = sort.startsWith('-')
  const field = SORT_FIELD[desc ? sort.slice(1) : sort] ?? 'timestamp'
  return { orderBy: field, order: desc ? 'desc' : 'asc' }
}

/** Platform Explorer's transitions query for a search (page and limit are added by the caller). */
export function txsQuery(s: TxsSearch): PeQuery {
  const types = (s.type ?? []).flatMap((t) => peTypeNumber(t) ?? [])
  const batches = (s.batch ?? []).flatMap((b) => peBatchNumber(b) ?? [])
  const { orderBy, order } = txOrder(s.sort)
  return {
    order,
    orderBy,
    ...(types.length > 0 ? { transaction_type: types.map(String) } : {}),
    ...(batches.length > 0 ? { transaction_type: ['1'], batch_type: batches.map(String) } : {}),
    ...(s.status ? { status: s.status.toUpperCase() } : {}),
    ...(s.gas?.min !== undefined ? { gas_min: s.gas.min } : {}),
    ...(s.gas?.max !== undefined ? { gas_max: s.gas.max } : {}),
    ...(s.owner ? { owner: s.owner } : {}),
    ...(s.from ? { timestamp_start: dayStart(s.from) } : {}),
    ...(s.to ? { timestamp_end: dayEnd(s.to) } : {}),
  }
}
