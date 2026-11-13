import type { NetworkId } from '@/lib/network'
import type { DecodedTx, InstantLockSource } from './types'

/** The InstantSend fields of a transaction whose block is not ChainLocked, from the source that answered. */
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
  | 'instantLockKeepDepth'
>

/**
 * - `settled`: the transaction's block is ChainLocked (or, on a network without ChainLocks, buried past the depth at
 *   which nodes prune locks). Its InstantSend lock no longer matters and nothing about it is shown.
 * - `none`: pending or mined, not settled, and the node that answered reports no lock.
 * - `claimed`: one source reports a lock; nothing independent has confirmed it.
 * - `corroborated`: a lock with no claim attached.
 * - `unknown`: the only answer came from Hyphen, which can't tell "no lock" from "not tracked".
 */
export type InstantLockState = 'settled' | 'none' | 'claimed' | 'corroborated' | 'unknown'

export interface InstantLockView {
  state: InstantLockState
  /** Who reports the lock; set for `claimed` and `corroborated`. */
  source?: InstantLockSource
}

/**
 * Whether InstantSend still says anything about this transaction. A ChainLock one node reports counts as a
 * ChainLock here: the lock state is dropped a moment early at worst, and never shown where nodes have pruned it.
 */
export function isSettled(tx: LockFacts): boolean {
  if (tx.height === undefined) return false
  if (tx.isChainLocked === true || tx.chainLockClaim !== undefined) return true
  return (
    tx.instantLockKeepDepth !== undefined &&
    tx.confirmations !== undefined &&
    tx.confirmations >= tx.instantLockKeepDepth
  )
}

/** The one answer every surface shows (settlement step, header chip, hover card). */
export function instantLockView(tx: LockFacts): InstantLockView {
  if (isSettled(tx)) return { state: 'settled' }
  if (tx.isInstantLocked === true) {
    return {
      state: tx.instantLockClaim === undefined ? 'corroborated' : 'claimed',
      source: tx.instantLockSource ?? 'dapi',
    }
  }
  return { state: tx.instantLockSource === 'hyphen' ? 'unknown' : 'none' }
}
