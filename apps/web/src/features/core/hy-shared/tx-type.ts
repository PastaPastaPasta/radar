import type { CoreTxType } from '@/lib/tx-types'

const KNOWN: Record<string, CoreTxType> = {
  normal: 'transfer',
  coinbase: 'coinbase',
  provider_register: 'pro-reg',
  provider_update_service: 'pro-up-serv',
  provider_update_registrar: 'pro-up-reg',
  provider_update_revoke: 'pro-up-rev',
  quorum_commitment: 'quorum-commitment',
  mnhf_signal: 'mnhf-signal',
  asset_lock: 'asset-lock',
  asset_unlock: 'asset-unlock',
}

/**
 * Hyphen's `txType` name as the kit's tx badge type, or undefined when the palette has no entry for it. Hyphen says
 * `data` when any output is OP_RETURN (`public_tx_type`), Radar only when every output is, so Hyphen's `data` is
 * Radar's only for a transaction with a single output; otherwise it may be a payment that carries data.
 */
export function coreTxType(hyphenType: string, outputCount?: number): CoreTxType | undefined {
  if (hyphenType === 'data') return outputCount === 1 ? 'data' : undefined
  return KNOWN[hyphenType]
}

export function txTypeLabel(hyphenType: string): string {
  return hyphenType.replace(/_/g, ' ')
}
