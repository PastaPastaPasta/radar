import type { QueryClient } from '@tanstack/react-query'
import { isSdkKey } from '@/data/sdk/cache'

export { clearSdkCache } from '@/data/sdk/cache'

/** Refetches what the Platform SDK answered, after the worker was replaced. */
export function refetchSdkQueries(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ predicate: (q) => isSdkKey(q.queryKey) })
}
