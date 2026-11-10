// wasm-bindgen objects hold a raw pointer and cannot cross postMessage. Turn them into
// structured-cloneable data (bigint, Map, Uint8Array and plain objects survive) and free them.
type Freeable = { free?: () => void };

export function plain(v: any): any {
  if (v === null || v === undefined || typeof v !== 'object') return v;
  if (v instanceof Uint8Array) return v;
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [plain(k), plain(x)]));
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v.toJSON === 'function') {
    const j = v.toJSON();
    (v as Freeable).free?.();
    return plain(j);
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) out[k] = plain(v[k]);
  return out;
}

export const hex = (b: Uint8Array | undefined): string =>
  b ? Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') : '';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes: ArrayLike<number>): string {
  const digits: number[] = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}
