import { bytesToHex } from '../hex'

export interface ParsedChainLock {
  height: number
  /** Display order. */
  hash: string
  signature: string
}

const CHAIN_LOCK_BYTES = 4 + 32 + 96

/** Reads a ChainLock message: height (u32 LE), block hash (internal order), BLS signature. */
export function parseChainLock(bytes: Uint8Array): ParsedChainLock {
  if (bytes.length !== CHAIN_LOCK_BYTES) {
    throw new Error(`A ChainLock is ${CHAIN_LOCK_BYTES} bytes, got ${bytes.length}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    height: view.getUint32(0, true),
    hash: bytesToHex(Uint8Array.from(bytes.subarray(4, 36)).reverse()),
    signature: bytesToHex(bytes.subarray(36)),
  }
}
