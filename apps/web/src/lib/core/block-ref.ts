const HASH = /^[0-9a-f]{64}$/i
const HEIGHT = /^\d{1,9}$/

export type BlockRef = { height: number } | { hash: string }

/** The block a URL segment names: a height or a 64-character hash; anything else names none. */
export function parseBlockRef(id: string): BlockRef | null {
  if (HEIGHT.test(id)) return { height: Number(id) }
  if (HASH.test(id)) return { hash: id.toLowerCase() }
  return null
}
