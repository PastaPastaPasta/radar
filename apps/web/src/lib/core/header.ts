import { bytesToHex } from '../hex'

export const HEADER_BYTES = 80

export interface ParsedHeader {
  version: number
  /** Display order (byte-reversed from the wire), like every hash Dash Core prints. */
  prevHash: string
  merkleRoot: string
  /** Seconds since the epoch. */
  time: number
  bits: number
  nonce: number
}

function reversedHex(bytes: Uint8Array): string {
  return bytesToHex(Uint8Array.from(bytes).reverse())
}

/** Reads the fields of an 80-byte block header. The block hash (X11) needs the Core decoder, so it is not computed here. */
export function parseHeader(bytes: Uint8Array): ParsedHeader {
  if (bytes.length !== HEADER_BYTES) {
    throw new Error(`A block header is ${HEADER_BYTES} bytes, got ${bytes.length}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    version: view.getInt32(0, true),
    prevHash: reversedHex(bytes.subarray(4, 36)),
    merkleRoot: reversedHex(bytes.subarray(36, 68)),
    time: view.getUint32(68, true),
    bits: view.getUint32(72, true),
    nonce: view.getUint32(76, true),
  }
}

/** Block bytes with the transaction count 0, which the Core decoder accepts and hashes. */
export function headerAsEmptyBlock(header: Uint8Array): Uint8Array {
  const out = new Uint8Array(HEADER_BYTES + 1)
  out.set(header)
  return out
}
