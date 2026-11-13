import { DataContract, Document, EvoSDK, Identity, StateTransition } from '@dashevo/evo-sdk'
import type { SdkDecodeKind, SdkDecodeOptions } from '../methods'

interface Decodable {
  toJSON(): unknown
  free?: () => void
}

interface FromBytes {
  fromBytes(bytes: Uint8Array): Decodable
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
  const value = (kind === 'identity' ? Identity : StateTransition) as unknown as FromBytes
  const decoded = value.fromBytes(bytes)
  const json = decoded.toJSON()
  decoded.free?.()
  return json
}
