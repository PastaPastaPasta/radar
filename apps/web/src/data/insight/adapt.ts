import type { HyAddress, HyAddressTx, HyProposal, HyUtxo } from '../hyphen/schemas'
import type { InsAddress, InsGovernanceInfo, InsProposal, InsTx, InsUtxo } from './schemas'

/** Hyphen's `txType` names, so one badge and one label table serve both indexes. */
const TX_TYPES: Record<number, string> = {
  1: 'provider_register',
  2: 'provider_update_service',
  3: 'provider_update_registrar',
  4: 'provider_update_revoke',
  5: 'coinbase',
  6: 'quorum_commitment',
  7: 'mnhf_signal',
  8: 'asset_lock',
  9: 'asset_unlock',
}

export function insightTxType(tx: Pick<InsTx, 'type' | 'vin'>): string {
  if (tx.vin.some((i) => i.coinbase != null)) return 'coinbase'
  return TX_TYPES[tx.type ?? 0] ?? 'normal'
}

/** The chain tip an answer about a confirmed transaction was read at: its height plus its confirmations, less one. */
export const txTip = (tx: InsTx): number | undefined =>
  tx.blockheight != null && tx.blockheight >= 0 && tx.confirmations != null && tx.confirmations > 0
    ? tx.blockheight + tx.confirmations - 1
    : undefined

export const adaptAddress = (a: InsAddress): HyAddress => ({
  address: a.address,
  balance: a.balance,
  totalReceived: a.totalReceived,
  totalSent: a.totalSent,
  txCount: a.txCount,
})

/** A transaction's effect on one address; undefined while it is unconfirmed (history rows are confirmed ones). */
export function adaptAddressTx(tx: InsTx, address: string): HyAddressTx | undefined {
  const height = tx.blockheight
  const time = tx.blocktime ?? tx.time
  if (height == null || height < 0 || time == null) return undefined
  let net = 0n
  for (const i of tx.vin) if (i.addr === address) net -= i.valueSat ?? 0n
  for (const o of tx.vout) if (o.scriptPubKey.addresses?.includes(address)) net += o.value
  return {
    txHash: tx.txid,
    blockHeight: height,
    blockTime: time,
    txType: insightTxType(tx),
    valueOut: tx.vout.reduce((sum, o) => sum + o.value, 0n),
    netValue: net,
    direction: net >= 0n ? 'in' : 'out',
  }
}

export const adaptUtxo = (u: InsUtxo): HyUtxo => ({
  txHash: u.txid,
  vout: u.vout,
  value: u.satoshis,
  height: u.height ?? 0,
  scriptPubKey: u.scriptPubKey,
})

/**
 * Insight lists proposals with their vote counts but not their funding state. "Meets the threshold" is the
 * absolute yes count against the network's funding threshold; "funded" is derived the way the budget is cut:
 * open proposals that meet it, most absolute yes votes first, take their payment while the superblock budget lasts.
 */
export function adaptProposals(
  list: readonly InsProposal[],
  info: InsGovernanceInfo,
  now: number,
): HyProposal[] {
  const passing = list
    .filter((p) => p.AbsoluteYesCount >= info.fundingthreshold && p.DataObject.end_epoch >= now)
    .sort((a, b) => b.AbsoluteYesCount - a.AbsoluteYesCount || (a.Hash < b.Hash ? 1 : -1))
  const funded = new Set<string>()
  let left = info.governancebudget
  for (const p of passing) {
    if (p.DataObject.payment_amount > left) continue
    left -= p.DataObject.payment_amount
    funded.add(p.Hash)
  }
  return list.map((p) => ({
    hash: p.Hash,
    name: p.DataObject.name,
    url: p.DataObject.url,
    paymentAddress: p.DataObject.payment_address,
    paymentAmount: p.DataObject.payment_amount,
    startTime: p.DataObject.start_epoch,
    endTime: p.DataObject.end_epoch,
    votes: { yes: p.YesCount, no: p.NoCount, abstain: p.AbstainCount },
    fundingThreshold: info.fundingthreshold,
    meetsFundingThreshold: p.AbsoluteYesCount >= info.fundingthreshold,
    funded: funded.has(p.Hash),
  }))
}
