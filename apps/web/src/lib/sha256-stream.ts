import { sha256 } from '@noble/hashes/sha2.js'

/** A SHA-256 that takes its input in pieces. */
export function sha256Stream(): { update(bytes: Uint8Array): void; hex(): string } {
  const hash = sha256.create()
  return {
    update: (bytes) => void hash.update(bytes),
    hex: () => Array.from(hash.digest(), (b) => b.toString(16).padStart(2, '0')).join(''),
  }
}
