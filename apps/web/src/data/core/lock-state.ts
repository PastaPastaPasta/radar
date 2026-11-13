import type { DecodedTx } from './types'

/** An InstantSend lock is only ever reported by the one source that answered, so no path can corroborate it yet. */
export function instantLockFields(isInstantLocked: boolean | undefined) {
  return isInstantLocked
    ? { isInstantLocked: true, instantLockClaim: 'one-node' as const }
    : { isInstantLocked: false }
}

export type InstantLockState = 'none' | 'claimed' | 'corroborated'

export function instantLockState(
  tx: Pick<DecodedTx, 'isInstantLocked' | 'instantLockClaim'>,
): InstantLockState {
  if (tx.isInstantLocked !== true) return 'none'
  return tx.instantLockClaim ? 'claimed' : 'corroborated'
}
