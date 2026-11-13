import type { DataClass } from '@/lib/data-class'

/** A prefunded specialised balance: credits held for one purpose (a contested name's vote, for instance). */
export interface PrefundedBalanceDto {
  /** The id asked about, in base58. */
  id: string
  balance: bigint
}

/** One encrypted note of the shielded pool, every field in lower-case hex. */
export interface ShieldedNoteDto {
  /** The note's position in the pool: the first index asked for, plus its place in the answer. */
  index: number
  cmx: string
  cvNet: string
  encryptedNote: string
  nullifier: string
}

export interface PChainMethods {
  'system.prefundedSpecializedBalance': {
    args: { id: string }
    result: PrefundedBalanceDto | null
  }
  /** The pool's total balance in credits; `null` when the pool has none. */
  'shielded.poolState': { args: Record<string, never>; result: bigint | null }
  /** Every anchor the pool still accepts, as 32-byte hex. */
  'shielded.anchors': { args: Record<string, never>; result: string[] }
  'shielded.mostRecentAnchor': { args: Record<string, never>; result: string | null }
  /** The pool serves notes from a `startIndex` that is a multiple of 2048; any other start is refused. */
  'shielded.encryptedNotes': {
    args: { startIndex: number; count: number }
    result: ShieldedNoteDto[]
  }
  /** Nullifier (32-byte hex, as asked) → whether it is spent. Every nullifier asked has an entry. */
  'shielded.nullifiers': { args: { nullifiers: string[] }; result: Map<string, boolean> }
}

export const P_CHAIN_CLASSES = {
  'system.prefundedSpecializedBalance': 'live',
  'shielded.poolState': 'live',
  'shielded.anchors': 'live',
  'shielded.mostRecentAnchor': 'live',
  'shielded.encryptedNotes': 'live',
  'shielded.nullifiers': 'live',
} as const satisfies Record<keyof PChainMethods, DataClass>
