import type { HyAddress, HyAddressTx, HyProposal, HyUtxo } from '../hyphen/schemas'
import type { BlockRow } from '../core/types'
import type {
  InsAddress,
  InsBlockList,
  InsGovernanceInfo,
  InsProposal,
  InsTx,
  InsUtxo,
} from './schemas'

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

/** Whether Insight has put the transaction in a block; a mempool transaction has no height and no confirmations. */
export const isMined = (tx: Pick<InsTx, 'blockheight' | 'confirmations'>): boolean =>
  tx.blockheight != null && tx.blockheight >= 0 && (tx.confirmations ?? 1) > 0

/** What a transaction does to one address, in duffs: outputs paying it less the inputs it spends. */
function netEffectOn(tx: Pick<InsTx, 'vin' | 'vout'>, address: string): bigint {
  let net = 0n
  for (const i of tx.vin) if (i.addr === address) net -= i.valueSat ?? 0n
  for (const o of tx.vout) if (o.scriptPubKey.addresses?.includes(address)) net += o.value
  return net
}

/** A transaction's effect on one address; undefined while it is unconfirmed (history rows are confirmed ones). */
export function adaptAddressTx(tx: InsTx, address: string): HyAddressTx | undefined {
  const time = tx.blocktime ?? tx.time
  if (!isMined(tx) || tx.blockheight == null || time == null) return undefined
  const net = netEffectOn(tx, address)
  return {
    txHash: tx.txid,
    blockHeight: tx.blockheight,
    blockTime: time,
    txType: insightTxType(tx),
    valueOut: tx.vout.reduce((sum, o) => sum + o.value, 0n),
    netValue: net,
    direction: net >= 0n ? 'in' : 'out',
  }
}

/** An unconfirmed transaction's effect on one address, for the pending area; undefined once it is mined. */
export function adaptPendingTx(
  tx: InsTx,
  address: string,
): { txid: string; net: bigint } | undefined {
  return isMined(tx) ? undefined : { txid: tx.txid, net: netEffectOn(tx, address) }
}

/** An unconfirmed output has no block: it is listed, but marked pending and left out of the balance. */
export const adaptUtxo = (u: InsUtxo): HyUtxo => ({
  txHash: u.txid,
  vout: u.vout,
  value: u.satoshis,
  height: u.height != null && u.height > 0 && (u.confirmations ?? 1) > 0 ? u.height : undefined,
  scriptPubKey: u.scriptPubKey,
})

/**
 * Insight lists proposals with their vote counts but not their funding state, so Radar works it out. "Meets the
 * threshold" is the absolute yes count against the network's funding threshold. "Funded" is derived the way the
 * budget is cut: proposals whose window covers the next superblock (`superblockAt`, in ms) and that meet the
 * threshold, most absolute yes votes first, take their payment while the superblock budget lasts. Without a
 * superblock time to measure windows against, no proposal is called funded.
 */
export function adaptProposals(
  list: readonly InsProposal[],
  info: InsGovernanceInfo,
  superblockAt: number | undefined,
): HyProposal[] {
  const funded = new Set<string>()
  if (superblockAt !== undefined) {
    const passing = list
      .filter(
        (p) =>
          p.AbsoluteYesCount >= info.fundingthreshold &&
          p.DataObject.start_epoch <= superblockAt &&
          p.DataObject.end_epoch >= superblockAt,
      )
      .sort((a, b) => b.AbsoluteYesCount - a.AbsoluteYesCount || (a.Hash < b.Hash ? 1 : -1))
    let left = info.governancebudget
    for (const p of passing) {
      if (p.DataObject.payment_amount > left) continue
      left -= p.DataObject.payment_amount
      funded.add(p.Hash)
    }
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
    funded: superblockAt === undefined ? undefined : funded.has(p.Hash),
  }))
}

/**
 * A block list as block rows, newest first by height, no higher than `top`. Insight orders blocks by time, so a block whose
 * time ties or trails its neighbour's can sit out of height order. A lock is not Insight's to say (`withLocks`), so none
 * is claimed here.
 */
export function adaptBlockRows(list: InsBlockList, top: number): BlockRow[] {
  return list.blocks
    .filter((b) => b.height <= top)
    .map((b) => ({
      height: b.height,
      hash: b.hash,
      time: b.time,
      txCount: b.txlength,
      size: b.size,
      chainLocked: false,
    }))
    .sort((a, b) => b.height - a.height)
}
