import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from './hex'

/** A SHA-256 that takes its input in pieces. */
export function sha256Stream(): { update(bytes: Uint8Array): void; hex(): string } {
  const hash = sha256.create()
  return {
    update: (bytes) => void hash.update(bytes),
    hex: () => bytesToHex(hash.digest()),
  }
}
