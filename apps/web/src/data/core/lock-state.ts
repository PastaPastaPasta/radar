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
  return isInstantLocked
    ? { isInstantLocked: true, instantLockClaim: 'one-node' as const, instantLockSource: source }
    : { isInstantLocked: false }
}

type LockFacts = Pick<
  DecodedTx,
  | 'height'
  | 'isChainLocked'
  | 'chainLockClaim'
  | 'isInstantLocked'
  | 'instantLockClaim'
  | 'instantLockSource'
>

/**
 * - `none`: pending, or mined and not yet ChainLocked, and no source reports a lock. A source's silence is meaningful.
 * - `claimed`: one or more sources report a lock; nothing independent has confirmed it.
 * - `corroborated`: a lock with no claim attached.
 * - `unknown`: mined in a ChainLocked block and no source reports a lock. Nodes have dropped it by now, so this says
 *   nothing either way.
 */
export type InstantLockState = 'none' | 'claimed' | 'corroborated' | 'unknown'

export interface InstantLockView {
  state: InstantLockState
  /** Who reports the lock, in the order DAPI then Hyphen. Empty for `none` and `unknown`. */
  sources: InstantLockSource[]
  /** The transaction is mined in a ChainLocked block, so a source's silence says nothing. */
  historical: boolean
}

/** Whether the block holding the transaction is ChainLocked, or one node says so. */
export function inChainLockedBlock(
  tx: Pick<DecodedTx, 'height' | 'isChainLocked' | 'chainLockClaim'>,
) {
  return tx.height !== undefined && (tx.isChainLocked === true || tx.chainLockClaim !== undefined)
}

/**
 * The one answer every surface shows. `hyphenLock` is Hyphen's persistent record of a lock (`live.tags.islock`), or
 * undefined when Hyphen was not asked or did not answer. It only counts for a transaction in a ChainLocked block;
 * before that the node's flag is the live signal and is read as it always was.
 */
export function instantLockView(tx: LockFacts, hyphenLock?: boolean): InstantLockView {
  const historical = inChainLockedBlock(tx)
  const sources: InstantLockSource[] = []
  if (tx.isInstantLocked === true) sources.push(tx.instantLockSource ?? 'dapi')
  if (historical && hyphenLock === true && !sources.includes('hyphen')) sources.push('hyphen')
  sources.sort()
  if (sources.length === 0) return { state: historical ? 'unknown' : 'none', sources, historical }
  const claimed = tx.instantLockClaim !== undefined || sources.includes('hyphen')
  return { state: claimed ? 'claimed' : 'corroborated', sources, historical }
}

export function instantLockState(tx: LockFacts, hyphenLock?: boolean): InstantLockState {
  return instantLockView(tx, hyphenLock).state
}
