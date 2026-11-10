const HEX = /^(?:[0-9a-fA-F]{2})*$/

export function isHex(value: string, byteLength?: number): boolean {
  if (!HEX.test(value)) return false
  return byteLength === undefined || value.length === byteLength * 2
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX.test(hex)) throw new Error('Invalid hex string')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function normalizeHex(value: string): string {
  return value.trim().replace(/^0x/i, '').toLowerCase()
}
