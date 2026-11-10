export interface Page<T> {
  items: T[]
  /** Page-based sources (pe): 1-based page and total when known (PE's total: -1 → undefined). */
  page?: number
  total?: number
  /** Cursor sources (hyphen): opaque next cursor; undefined at the end. */
  nextCursor?: string
}
