import type { NetworkId } from '@/lib/network'
import type { DecodedTx, InstantLockSource } from './types'

/**
 * Dash Core deletes a transaction's InstantSend lock once the block holding it is fully confirmed by a ChainLock, and
 * nodes do that at different moments. For a mined transaction in a ChainLocked block, a node saying "no lock" only
 * means that node no longer holds one. It is never evidence that none existed.
 */
export function instantLockFields(
  isInstantLocked: boolean | undefined,
  source: InstantLockSource = 'dapi',
) {
  if (isInstantLocked) {
    return {
      isInstantLocked: true,
      instantLockClaim: 'one-node' as const,
      instantLockSource: source,
    }
  }
  // Hyphen has no record of "no lock": its lock map is live state filled from the node's ZMQ feed while the daemon
  // runs, and empty after a restart or when the feed is off. Its `false` is therefore silence.
  return source === 'hyphen'
    ? { isInstantLocked: false, instantLockSource: source }
    : { isInstantLocked: false }
}

/**
 * Core prunes InstantSend locks this many blocks under the tip when ChainLocks are off: 24 on mainnet, 6 elsewhere.
 * On a network with ChainLocks it drops them once the block is ChainLocked instead.
 */
export const instantLockKeepDepth = (net: NetworkId) => (net === 'mainnet' ? 24 : 6)

type LockFacts = Pick<
  DecodedTx,
  | 'height'
  | 'confirmations'
  | 'isChainLocked'
  | 'chainLockClaim'
  | 'isInstantLocked'
  | 'instantLockClaim'
  | 'instantLockSource'
  | 'instantLockRemembered'
  | 'instantLockKeepDepth'
>

/**
 * - `none`: pending, or mined and not yet historical, and the node that answered reports no lock. Its silence is
 *   meaningful.
 * - `claimed`: one or more sources report a lock; nothing independent has confirmed it.
 * - `corroborated`: a lock with no claim attached.
 * - `unknown`: no source can say. Either the transaction is historical and nodes have dropped its lock by now, or the
 *   only answer came from Hyphen, which can't tell "no lock" from "not tracked".
 */
export type InstantLockState = 'none' | 'claimed' | 'corroborated' | 'unknown'

export interface InstantLockView {
  state: InstantLockState
  /** Who reports the lock, in the order DAPI then Hyphen. Empty for `none` and `unknown`. */
  sources: InstantLockSource[]
  /** The transaction is mined past the point where nodes drop locks, so a node's silence says nothing. */
  historical: boolean
  /** Why `unknown`: nodes dropped the lock (`pruned`), or the answering source cannot say (`source`). */
  unknownBy?: 'pruned' | 'source'
}

/**
 * Whether the block holding the transaction is ChainLocked. A ChainLock one node reports counts too: it can only
 * soften "no lock" into "not known", which is the safe way to be wrong.
 */
export function inChainLockedBlock(
  tx: Pick<DecodedTx, 'height' | 'isChainLocked' | 'chainLockClaim'>,
) {
  return tx.height !== undefined && (tx.isChainLocked === true || tx.chainLockClaim !== undefined)
}

/**
 * Whether nodes have, or may have, dropped this transaction's lock: it is mined in a ChainLocked block, or the network
 * has no ChainLock at all and the transaction is buried at least `instantLockKeepDepth` deep.
 */
export function isHistorical(
  tx: Pick<
    DecodedTx,
    'height' | 'confirmations' | 'isChainLocked' | 'chainLockClaim' | 'instantLockKeepDepth'
  >,
) {
  if (tx.height === undefined) return false
  if (inChainLockedBlock(tx)) return true
  return (
    tx.instantLockKeepDepth !== undefined &&
    tx.confirmations !== undefined &&
    tx.confirmations >= tx.instantLockKeepDepth
  )
}

/**
 * The one answer every surface shows. `hyphenLock` is Hyphen's lock tag (`live.tags.islock`) read next to a DAPI
 * answer, or undefined when Hyphen was not asked or did not answer. It is live state: `true` means Hyphen's node
 * relayed a lock while Hyphen was listening, `false` only means Hyphen does not know. A remembered lock and Hyphen's
 * `true` count only for a historical transaction; before that the answering node's flag is the live signal.
 */
export function instantLockView(tx: LockFacts, hyphenLock?: boolean): InstantLockView {
  const historical = isHistorical(tx)
  const sources: InstantLockSource[] = []
  if (tx.isInstantLocked === true) sources.push(tx.instantLockSource ?? 'dapi')
  if (historical && tx.instantLockRemembered === true && !sources.includes('dapi')) {
    sources.push('dapi')
  }
  if (historical && hyphenLock === true && !sources.includes('hyphen')) sources.push('hyphen')
  sources.sort()
  if (sources.length === 0) {
    if (tx.instantLockSource === 'hyphen') {
      return { state: 'unknown', sources, historical, unknownBy: 'source' }
    }
    return historical
      ? { state: 'unknown', sources, historical, unknownBy: 'pruned' }
      : { state: 'none', sources, historical }
  }
  const claimed =
    tx.instantLockClaim !== undefined ||
    tx.instantLockRemembered === true ||
    sources.includes('hyphen')
  return { state: claimed ? 'claimed' : 'corroborated', sources, historical }
}
