import type { DataClass } from '@/lib/data-class'

/** What a node says about one state transition by its hash (unproved). */
export interface StateTransitionResultDto {
  hash: string
  /** `pending`: the node did not report an execution within the short wait: not yet executed, or unknown to it. */
  status: 'executed' | 'failed' | 'pending'
  /** The consensus error of a failed transition, as the node writes it. */
  error?: string
  /** The owner's credit balance after it executed, when the node reported it. */
  ownerBalance?: bigint
}

/** A state transition's own fields, read from its serialised bytes by the SDK's local decoder (no network, unproved). */
export interface StateTransitionDecodedDto {
  /** The SDK's action name, such as `DocumentsBatch([Create])`. */
  actionType: string
  /** The type number Platform Explorer uses for it (`BATCH` is 1). */
  typeNumber: number
  ownerId?: string
  identityNonce?: bigint
  identityContractNonce?: bigint
  /** The fee increase the sender agreed to, in percent. */
  userFeeIncrease: number
  signaturePublicKeyId?: number
  signature?: Uint8Array
  /** The hash of the transition with its signature, which is the transition's hash. */
  hash: string
  /** The fields of the transition's type as the SDK writes them as JSON; `null` for a type the SDK cannot split out. */
  body: unknown
}

/** SDK methods only this package calls: add entries here, never in a shared file. */
export interface PBlocksMethods {
  'stateTransitions.waitForStateTransitionResult': {
    args: { hash: string }
    result: StateTransitionResultDto
  }
  'stateTransitions.decode': { args: { data: string }; result: StateTransitionDecodedDto }
}

export const P_BLOCKS_CLASSES = {
  'stateTransitions.waitForStateTransitionResult': 'live',
  'stateTransitions.decode': 'live',
} as const satisfies Record<keyof PBlocksMethods, DataClass>
