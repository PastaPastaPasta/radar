import * as wasm from '@dashevo/evo-sdk'
import { DataContract, Document, EvoSDK, Identity, StateTransition } from '@dashevo/evo-sdk'
import type { SdkDecodeKind, SdkDecodeOptions } from '../methods'

interface Decodable {
  toJSON(): unknown
  free?: () => void
}

interface FromBytes {
  fromBytes(bytes: Uint8Array): Decodable
}

/**
 * The typed transition class that can print each action type. `StateTransition` itself has no `toJSON`, so the
 * body comes from the class that matches `actionType`; an action with no typed class (a credit transfer) decodes
 * to the envelope fields alone.
 */
const TYPED_BODY: Record<string, string> = {
  DocumentsBatch: 'BatchTransition',
  DataContractCreate: 'DataContractCreateTransition',
  DataContractUpdate: 'DataContractUpdateTransition',
  IdentityCreate: 'IdentityCreateTransition',
  IdentityTopUp: 'IdentityTopUpTransition',
  IdentityUpdate: 'IdentityUpdateTransition',
  IdentityCreditWithdrawal: 'IdentityCreditWithdrawalTransition',
  MasternodeVote: 'MasternodeVoteTransition',
  AddressFundsTransfer: 'AddressFundsTransferTransition',
  AddressFundingFromAssetLock: 'AddressFundingFromAssetLockTransition',
  AddressCreditWithdrawal: 'AddressCreditWithdrawalTransition',
  IdentityCreateFromAddresses: 'IdentityCreateFromAddressesTransition',
  IdentityTopUpFromAddresses: 'IdentityTopUpFromAddressesTransition',
  IdentityCreateFromShieldedPool: 'IdentityCreateFromShieldedPoolTransition',
  IdentityTopUpFromShieldedPool: 'IdentityTopUpFromShieldedPoolTransition',
  Shield: 'ShieldTransition',
  ShieldFromAssetLock: 'ShieldFromAssetLockTransition',
  ShieldFromIdentity: 'ShieldFromIdentityTransition',
  ShieldedTransfer: 'ShieldedTransferTransition',
  ShieldedWithdrawal: 'ShieldedWithdrawalTransition',
  Unshield: 'UnshieldTransition',
  TokenShield: 'TokenShieldTransition',
  TokenUnshield: 'TokenUnshieldTransition',
  TokenShieldedTransfer: 'TokenShieldedTransferTransition',
  TokenShieldedTransferWithShieldedFee: 'TokenShieldedTransferWithShieldedFeeTransition',
  TokenUnshieldWithShieldedFee: 'TokenUnshieldWithShieldedFeeTransition',
  TokenPurchaseFromShieldedPool: 'TokenPurchaseFromShieldedPoolTransition',
}

const text = (value: { toString(): string } | undefined | null) =>
  value == null ? null : value.toString()

/**
 * The older transition classes read the bytes after the one-byte variant tag, the newer shielded ones read the
 * whole envelope; try the likelier layout first and the other as the fallback.
 */
function typedBody(typed: FromBytes, bytes: Uint8Array, name: string): unknown {
  const wholeFirst = /^(Shield|Unshield|Token(Shield|Unshield|Purchase))/.test(name)
  const attempts = wholeFirst ? [bytes, bytes.subarray(1)] : [bytes.subarray(1), bytes]
  let failure: unknown
  for (const attempt of attempts) {
    try {
      const decoded = typed.fromBytes(attempt)
      try {
        return decoded.toJSON()
      } finally {
        decoded.free?.()
      }
    } catch (error) {
      failure ??= error
    }
  }
  throw failure
}

function decodeStateTransition(bytes: Uint8Array): unknown {
  const transition = StateTransition.fromBytes(bytes)
  try {
    const actionType = transition.actionType
    const name = actionType.replace(/\(.*$/, '')
    const typed = (wasm as unknown as Record<string, FromBytes | undefined>)[TYPED_BODY[name] ?? '']
    let body: unknown = null
    if (typed) body = typedBody(typed, bytes, name)
    return {
      actionType,
      actionTypeNumber: transition.actionTypeNumber,
      hash: transition.hash(false),
      ownerId: text(transition.ownerId?.toBase58()),
      identityNonce: text(transition.identityNonce),
      identityContractNonce: text(transition.identityContractNonce),
      userFeeIncrease: transition.userFeeIncrease,
      signaturePublicKeyId: transition.signaturePublicKeyId ?? null,
      byteLength: bytes.length,
      body,
    }
  } finally {
    transition.free()
  }
}

const invalid = (message: string) => Object.assign(new Error(message), { name: 'InvalidArgument' })

/**
 * Local decoding for the tools (no network). A document needs the contract it belongs to (`opts.contract`, the
 * contract's serialized bytes) and the document type's name (`opts.type`).
 */
export async function decodeWithWasm(
  kind: SdkDecodeKind,
  bytes: Uint8Array,
  opts: SdkDecodeOptions = {},
): Promise<unknown> {
  const version = await EvoSDK.getLatestVersionNumber()
  if (kind === 'dataContract') {
    const contract = DataContract.fromBytes(bytes, false, version)
    try {
      return contract.toJSON(version)
    } finally {
      contract.free()
    }
  }
  if (kind === 'document') {
    if (!opts.contract || !opts.type)
      throw invalid('Decoding a document needs its contract and type')
    const contract = DataContract.fromBytes(opts.contract, false, version)
    try {
      const document = Document.fromBytes(bytes, contract, opts.type, version)
      try {
        return document.toJSON(version)
      } finally {
        document.free()
      }
    } finally {
      contract.free()
    }
  }
  if (kind === 'stateTransition') return decodeStateTransition(bytes)
  const decoded = (Identity as unknown as FromBytes).fromBytes(bytes)
  try {
    return decoded.toJSON()
  } finally {
    decoded.free?.()
  }
}
