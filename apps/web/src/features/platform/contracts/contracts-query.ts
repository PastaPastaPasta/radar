import type { NumericRange } from '@/lib/search-schemas'

export {
  contractsPeQuery as peParams,
  SORT_FIELD,
  sortOf,
  type ContractsSearch,
  type SortName,
} from '@/data/query/prefetch/p-data'

/** A range as the address writes it, `min..max`. */
export const rangeText = (r: NumericRange | undefined): string | undefined =>
  r === undefined ? undefined : `${r.min ?? ''}..${r.max ?? ''}`
