/**
 * The low 40 bits of a stored identity nonce or identity-contract nonce are the nonce. Platform keeps a bitfield of the
 * nonces it skipped in the 24 bits above (`IDENTITY_NONCE_VALUE_FILTER` in rs-dpp), so the raw value is not the nonce.
 */
const NONCE_VALUE = 0xff_ffff_ffffn

export function nonceValue(stored: bigint): bigint {
  return stored & NONCE_VALUE
}
