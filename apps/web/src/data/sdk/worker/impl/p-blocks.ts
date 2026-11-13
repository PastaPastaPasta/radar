import * as wasm from '@dashevo/evo-sdk'
import type { PBlocksMethods } from '../../methods'
import type { ImplOf } from './types'

/** How long a node gets to report a transition before the answer is "not yet executed" (under the worker's own limit). */
export const RESULT_WAIT_MS = 6000

interface ResultLike {
  status: string
  error?: string | undefined
  ownerBalance?: bigint | undefined
  free?: () => void
}

/** The part of `EvoSDK` this package's methods read. */
export interface PBlocksReads {
  stateTransitions: {
    waitForStateTransitionResult(hash: string): Promise<ResultLike>
  }
}

type Impl<M extends keyof PBlocksMethods> = ImplOf<PBlocksReads, M>

type ResultDto = PBlocksMethods['stateTransitions.waitForStateTransitionResult']['result']

const PENDING = Symbol('pending')

/**
 * The class that reads a transition of each type number (Platform Explorer's numbers, which are the SDK's). The
 * shielded types carry no converter from a `StateTransition`, so those read the same bytes directly.
 */
const BODY_CLASSES: Record<number, string> = {
  0: 'DataContractCreateTransition',
  1: 'BatchTransition',
  2: 'IdentityCreateTransition',
  3: 'IdentityTopUpTransition',
  4: 'DataContractUpdateTransition',
  5: 'IdentityUpdateTransition',
  6: 'IdentityCreditWithdrawalTransition',
  7: 'IdentityCreditTransfer',
  8: 'MasternodeVoteTransition',
  9: 'IdentityCreditTransferToAddresses',
  10: 'IdentityCreateFromAddressesTransition',
  11: 'IdentityTopUpFromAddressesTransition',
  12: 'AddressFundsTransferTransition',
  13: 'AddressFundingFromAssetLockTransition',
  14: 'AddressCreditWithdrawalTransition',
  15: 'ShieldTransition',
  16: 'ShieldedTransferTransition',
  17: 'UnshieldTransition',
  18: 'ShieldFromAssetLockTransition',
  19: 'ShieldedWithdrawalTransition',
  20: 'IdentityCreateFromShieldedPoolTransition',
  21: 'ShieldFromIdentityTransition',
  22: 'IdentityTopUpFromShieldedPoolTransition',
  23: 'IdentityKeyLimitsUpdate',
  24: 'ContractUserModeration',
  25: 'ContractFeeClaim',
  26: 'TokenShieldedTransferWithShieldedFeeTransition',
  27: 'TokenUnshieldWithShieldedFeeTransition',
  28: 'TokenPurchaseFromShieldedPoolTransition',
}

interface BodyClass {
  fromStateTransition?: (st: wasm.StateTransition) => Jsonable
  fromBytes?: (bytes: Uint8Array) => Jsonable
}
interface Jsonable {
  toJSON(): unknown
  free?: () => void
}

function bodyOf(st: wasm.StateTransition, bytes: Uint8Array, typeNumber: number): unknown {
  const name = BODY_CLASSES[typeNumber]
  const cls = name === undefined ? undefined : (wasm as unknown as Record<string, BodyClass>)[name]
  if (!cls) return null
  const typed = cls.fromStateTransition ? cls.fromStateTransition(st) : cls.fromBytes?.(bytes)
  if (!typed) return null
  try {
    return typed.toJSON()
  } finally {
    typed.free?.()
  }
}

export const pBlocksImpl: { [M in keyof PBlocksMethods]: Impl<M> } = {
  async 'stateTransitions.waitForStateTransitionResult'(sdk, { hash }) {
    const call = sdk.stateTransitions.waitForStateTransitionResult(hash)
    call.catch(() => undefined)
    const wait = new Promise<typeof PENDING>((resolve) =>
      setTimeout(resolve, RESULT_WAIT_MS, PENDING),
    )
    const answered = await Promise.race([call, wait])
    if (answered === PENDING) return { data: { hash, status: 'pending' } }
    const status = answered.status.toUpperCase()
    const data: ResultDto =
      status === 'SUCCESS'
        ? { hash, status: 'executed' }
        : status === 'ERROR'
          ? { hash, status: 'failed', ...(answered.error ? { error: answered.error } : {}) }
          : { hash, status: 'pending' }
    if (answered.ownerBalance !== undefined) data.ownerBalance = answered.ownerBalance
    answered.free?.()
    return { data }
  },

  async 'stateTransitions.decode'(_sdk, { data }) {
    await wasm.EvoSDK.getLatestVersionNumber()
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const st = wasm.StateTransition.fromBytes(bytes)
    try {
      const typeNumber = st.actionTypeNumber
      return {
        data: {
          actionType: st.actionType,
          typeNumber,
          ...(st.ownerId ? { ownerId: st.ownerId.toString() } : {}),
          ...(st.identityNonce !== undefined ? { identityNonce: st.identityNonce } : {}),
          ...(st.identityContractNonce !== undefined
            ? { identityContractNonce: st.identityContractNonce }
            : {}),
          userFeeIncrease: st.userFeeIncrease,
          ...(st.signaturePublicKeyId !== undefined
            ? { signaturePublicKeyId: st.signaturePublicKeyId }
            : {}),
          ...(st.signature ? { signature: st.signature } : {}),
          hash: st.hash(false),
          body: bodyOf(st, bytes, typeNumber),
        },
      }
    } finally {
      st.free()
    }
  },
}
