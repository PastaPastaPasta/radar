import { infiniteQueryOptions } from '@tanstack/react-query'
import type { Sourced } from '@/data/envelope'
import { dataClass, type DataClass } from '@/data/query/stale'
import type { hyKeys } from '@/data/query/keys'

type HyKey = ReturnType<typeof hyKeys>

interface Paged {
  nextCursor?: string
}

/** Hyphen list pages chained by cursor: "Show more" fetches the next one and keeps the earlier pages. */
export function cursorPages<T extends Paged>(opts: {
  key: HyKey
  fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<Sourced<T>>
  dataClass?: DataClass
  refetchInterval?: number
}) {
  return infiniteQueryOptions({
    queryKey: opts.key,
    queryFn: ({ pageParam, signal }) => opts.fetchPage(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Sourced<T>) => last.data.nextCursor,
    ...dataClass(opts.dataClass ?? 'index'),
    ...(opts.refetchInterval === undefined ? {} : { refetchInterval: opts.refetchInterval }),
  })
}
