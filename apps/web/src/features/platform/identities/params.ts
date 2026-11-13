import type { PeIdentity } from '@/data/pe/schemas'
export {
  dashToCredits,
  IDENTITY_TYPES,
  parseIdentitySort,
  peIdentitiesQuery,
  SORTS,
  type IdentitiesFilters,
  type NumericRange,
  type SortId,
} from '@/data/query/prefetch/p-id'
import type { NumericRange } from '@/data/query/prefetch/p-id'

export function rangeText(range: NumericRange | undefined): string | undefined {
  if (!range || (range.min === undefined && range.max === undefined)) return undefined
  return `${range.min ?? ''}..${range.max ?? ''}`
}

const DAY = 86_400_000

/** PE has no creation-date filter for identities, so the dates narrow the rows of the page being shown. */
export function inDateRange(row: PeIdentity, from: string | undefined, to: string | undefined): boolean {
  if (!from && !to) return true
  const at = row.timestamp
  if (at === null || at === undefined) return false
  if (from && at < Date.parse(`${from}T00:00:00Z`)) return false
  if (to && at >= Date.parse(`${to}T00:00:00Z`) + DAY) return false
  return true
}
