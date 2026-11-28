import { base58Encode } from './base58'

export interface TransitionTarget {
  /** The data contract's id, base58. */
  contract: string
  /** The document type, for a document transition. */
  documentType?: string
}

/**
 * The data contract a state transition acts on, read from its serialised bytes (bincode, variable-length integers) as
 * Platform Explorer returns them in a row's `data`. Only the leading fields are read, up to the contract id, so the
 * reader needs no schema and no SDK. A transition that names no contract (a top-up, a credit transfer) or bytes it
 * cannot follow give `undefined`.
 *
 * Layouts (dashpay/platform `rs-dpp`): every enum is a varint tag, every versioned struct one more tag.
 * - DataContractCreate: V0 { data_contract: { V*: id, … }, … }
 * - DataContractUpdate: V0 { identity_contract_nonce, data_contract: { V*: id, … }, … }
 * - Batch: V0 { owner_id, transitions: Vec<DocumentTransition> } or V1 { owner_id, transitions: Vec<BatchedTransition> },
 *   whose first transition names the contract: a document's base is { id, nonce, type name, data_contract_id }, a
 *   token's { nonce, token_contract_position, data_contract_id }.
 * - MasternodeVote: V0 { pro_tx_hash, voter_identity_id, vote: ResourceVote V0 { ContestedDocumentResourceVotePoll {
 *   contract_id, document_type_name } } }
 * - ContractUserModeration, ContractFeeClaim: V0 { owner_id, data_contract_id }
 * - The token transitions paid from the shielded pool: V0 { data_contract_id }
 */
export function transitionTarget(data: string | null | undefined): TransitionTarget | undefined {
  if (!data) return undefined
  try {
    const found = readTarget(new Reader(base64Bytes(data)))
    if (!found) return undefined
    const contract = base58Encode(found.contract)
    return found.documentType === undefined
      ? { contract }
      : { contract, documentType: found.documentType }
  } catch {
    return undefined
  }
}

/** `StateTransition`'s variant tags (its declaration order, not Platform Explorer's type numbers). */
const Tag = {
  DataContractCreate: 0,
  DataContractUpdate: 1,
  Batch: 2,
  MasternodeVote: 8,
  ContractUserModeration: 24,
  ContractFeeClaim: 25,
  TokenShieldedTransferWithShieldedFee: 26,
  TokenUnshieldWithShieldedFee: 27,
  TokenPurchaseFromShieldedPool: 28,
} as const

interface Raw {
  contract: Uint8Array
  documentType?: string
}

function readTarget(r: Reader): Raw | undefined {
  switch (r.varint()) {
    case Tag.DataContractCreate:
      r.varint()
      r.varint()
      return { contract: r.bytes(32) }
    case Tag.DataContractUpdate:
      r.varint()
      r.varint()
      r.varint()
      return { contract: r.bytes(32) }
    case Tag.Batch:
      return readBatch(r)
    case Tag.MasternodeVote: {
      r.varint()
      r.skip(64)
      // Vote::ResourceVote, ResourceVote::V0, VotePoll::ContestedDocumentResourceVotePoll
      if (r.varint() !== 0 || r.varint() !== 0 || r.varint() !== 0) return undefined
      return { contract: r.bytes(32), documentType: r.text() }
    }
    case Tag.ContractUserModeration:
    case Tag.ContractFeeClaim:
      r.varint()
      r.skip(32)
      return { contract: r.bytes(32) }
    case Tag.TokenShieldedTransferWithShieldedFee:
    case Tag.TokenUnshieldWithShieldedFee:
    case Tag.TokenPurchaseFromShieldedPool:
      r.varint()
      return { contract: r.bytes(32) }
    default:
      return undefined
  }
}

function readBatch(r: Reader): Raw | undefined {
  const version = r.varint()
  if (version > 1) return undefined
  r.skip(32)
  if (r.varint() === 0) return undefined
  // V1 wraps each transition in BatchedTransition::{Document, Token}; V0 holds document transitions alone.
  const token = version === 1 && r.varint() === 1
  // The action's tag, its version and its base's version.
  r.varint()
  r.varint()
  r.varint()
  if (token) {
    r.varint()
    r.varint()
    return { contract: r.bytes(32) }
  }
  r.skip(32)
  r.varint()
  const documentType = r.text()
  return { contract: r.bytes(32), documentType }
}

const utf8 = new TextDecoder('utf-8', { fatal: true })

class Reader {
  private at = 0
  private readonly buf: Uint8Array
  constructor(buf: Uint8Array) {
    this.buf = buf
  }

  private need(n: number): void {
    if (n < 0 || this.at + n > this.buf.length) throw new RangeError('short')
  }

  skip(n: number): void {
    this.need(n)
    this.at += n
  }

  bytes(n: number): Uint8Array {
    this.need(n)
    const out = this.buf.subarray(this.at, this.at + n)
    this.at += n
    return out
  }

  text(): string {
    return utf8.decode(this.bytes(this.varint()))
  }

  /** bincode's varint: one byte below 251, else 251/252/253 and a little-endian u16/u32/u64. */
  varint(): number {
    this.need(1)
    const first = this.buf[this.at++]!
    if (first < 251) return first
    const width = first === 251 ? 2 : first === 252 ? 4 : first === 253 ? 8 : 0
    if (width === 0) throw new RangeError('varint')
    const raw = this.bytes(width)
    let n = 0
    for (let i = width - 1; i >= 0; i--) n = n * 256 + raw[i]!
    return n
  }
}

function base64Bytes(value: string): Uint8Array {
  const bin = atob(value)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
