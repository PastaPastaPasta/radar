import { base58Encode, isPlatformId } from '@/lib/base58'
import { hexToBytes } from '@/lib/hex'

export type IdentityInput =
  | { kind: 'id'; id: string }
  | { kind: 'hex'; id: string }
  | { kind: 'invalid' }

const HEX64 = /^[0-9a-fA-F]{64}$/

/** An identity ID is base58 text; the same 32 bytes written as 64 hex characters are accepted and converted. */
export function readIdentityInput(raw: string): IdentityInput {
  const text = raw.trim()
  if (HEX64.test(text)) return { kind: 'hex', id: base58Encode(hexToBytes(text)) }
  return isPlatformId(text) ? { kind: 'id', id: text } : { kind: 'invalid' }
}

const HASH160 = /^[0-9a-fA-F]{40}$/

export type KeyHashInput = { ok: true; pkh: string } | { ok: false; reason: 'empty' | 'length' | 'chars' }

/** A public key hash is the 20 bytes of HASH160 as 40 hex characters. */
export function readKeyHash(raw: string): KeyHashInput {
  const text = raw.trim().replace(/^0x/i, '')
  if (text === '') return { ok: false, reason: 'empty' }
  if (HASH160.test(text)) return { ok: true, pkh: text.toLowerCase() }
  return { ok: false, reason: /^[0-9a-fA-F]*$/.test(text) ? 'length' : 'chars' }
}

export const KEY_TYPES = ['ECDSA_SECP256K1', 'BLS12_381', 'ECDSA_HASH160', 'BIP13_SCRIPT_HASH', 'EDDSA_25519_HASH160'] as const
export const KEY_PURPOSES = ['AUTHENTICATION', 'ENCRYPTION', 'DECRYPTION', 'TRANSFER', 'SYSTEM', 'VOTING', 'OWNER'] as const
export const SECURITY_LEVELS = ['MASTER', 'CRITICAL', 'HIGH', 'MEDIUM'] as const

/** Key types whose data is already a 20-byte hash. */
export const isHashKeyType = (type: number): boolean => type === 2 || type === 4

export const keyTypeName = (n: number): string => KEY_TYPES[n] ?? `TYPE_${n}`
export const keyPurposeName = (n: number): string => KEY_PURPOSES[n] ?? `PURPOSE_${n}`
export const securityLevelName = (n: number): string => SECURITY_LEVELS[n] ?? `LEVEL_${n}`

export const IDENTITY_TABS = [
  'overview',
  'keys',
  'names',
  'tokens',
  'groups',
  'votes',
  'advanced',
  'transactions',
  'contracts',
  'documents',
  'transfers',
] as const
export type IdentityTab = (typeof IDENTITY_TABS)[number]

/** The tabs read from PE's index. */
export const INDEXED_TABS: readonly IdentityTab[] = ['transactions', 'contracts', 'documents', 'transfers']
