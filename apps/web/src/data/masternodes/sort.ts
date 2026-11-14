import type { MnRow } from './rows'

/** The columns `/masternodes` sorts by, in the URL's `sort` field (`-uptime_30d` is descending). */
export const MN_SORT_KEYS = [
  'protx',
  'type',
  'address',
  'country',
  'hosting',
  'version',
  'protocol',
  'status',
  'uptime_7d',
  'uptime_30d',
  'last_paid',
  'registered',
  'pose_penalty',
  'platform_30d',
  'next_block',
] as const

export type MnSortKey = (typeof MN_SORT_KEYS)[number]

/** Banned, then silent, then unknown, then answering: so the default sort puts the healthy list first. */
export function statusRank(row: MnRow): number {
  if (row.status === 'pose-banned') return 0
  const reachable = row.crawl?.reachable
  return reachable === true ? 3 : reachable === false ? 1 : 2
}

export type SortValue = number | string | null

const positive = (n: number | null | undefined): number | null => (n != null && n > 0 ? n : null)

const valueOf: Record<MnSortKey, (r: MnRow) => SortValue> = {
  protx: (r) => r.protx,
  type: (r) => r.type,
  address: (r) => r.service,
  country: (r) => r.crawl?.country ?? null,
  hosting: (r) => r.crawl?.as_org ?? null,
  version: (r) => r.crawl?.version ?? null,
  protocol: (r) => r.crawl?.protocol ?? null,
  status: statusRank,
  uptime_7d: (r) => r.crawl?.uptime_7d ?? null,
  uptime_30d: (r) => r.crawl?.uptime_30d ?? null,
  last_paid: (r) => positive(r.crawl?.last_paid_height),
  registered: (r) => positive(r.crawl?.registered_height),
  pose_penalty: (r) => r.crawl?.pose_penalty ?? null,
  platform_30d: (r) => (r.crawl?.platform?.d30 == null ? null : Number(r.crawl.platform.d30)),
  next_block: (r) => r.crawl?.platform?.next ?? null,
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

export const isMnSortKey = (key: string): key is MnSortKey =>
  (MN_SORT_KEYS as readonly string[]).includes(key)

/** Splits a URL sort (`-status`) into its key and direction; a key the table lacks falls back to `fallback`. */
export function parseSort<K extends string>(
  sort: string,
  isKey: (key: string) => key is K,
  fallback: { key: K; desc: boolean },
): { key: K; desc: boolean } {
  const desc = sort.startsWith('-')
  const key = desc ? sort.slice(1) : sort
  return isKey(key) ? { key, desc } : fallback
}

/** A new array in order. An item with no value comes last in either direction; ties go by `id`. */
export function sortItems<T>(
  items: readonly T[],
  desc: boolean,
  read: (item: T) => SortValue,
  id: (item: T) => string,
): T[] {
  const keyed = items.map((item) => ({ item, value: read(item), id: id(item) }))
  keyed.sort((a, b) => {
    if (a.value === null || b.value === null) {
      if (a.value === b.value) return a.id < b.id ? -1 : 1
      return a.value === null ? 1 : -1
    }
    const order = compare(a.value, b.value)
    return order !== 0 ? (desc ? -order : order) : a.id < b.id ? -1 : 1
  })
  return keyed.map((k) => k.item)
}

export const parseMnSort = (sort: string) =>
  parseSort(sort, isMnSortKey, { key: 'status', desc: true })

export function sortMnRows(rows: readonly MnRow[], sort: string): MnRow[] {
  const { key, desc } = parseMnSort(sort)
  return sortItems(rows, desc, valueOf[key], (r) => r.protx)
}
