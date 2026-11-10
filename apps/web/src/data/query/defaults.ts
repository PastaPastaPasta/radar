import type { QueryClientConfig } from '@tanstack/react-query'
import { isSourceError } from '../errors'
import { withDataClass } from './persister'
import { REFETCH_ON_FOCUS, type DataClass } from './stale'

const MAX_RETRIES = 2

/** Kinds worth retrying: transient transport faults and rate limits (§2.3). */
export function retryable(error: unknown): boolean {
  if (!isSourceError(error)) return false
  switch (error.kind) {
    case 'network':
    case 'timeout':
    case 'rate-limited':
      return true
    case 'http':
      return error.status === undefined || error.status >= 500
    default:
      return false
  }
}

export function retryDelay(attempt: number, error: unknown): number {
  if (isSourceError(error) && error.retryAfterMs !== undefined) return error.retryAfterMs
  return 1000 * 2 ** attempt
}

export const queryDefaults: NonNullable<QueryClientConfig['defaultOptions']> = {
  queries: {
    retry: (failureCount, error) => failureCount < MAX_RETRIES && retryable(error),
    retryDelay,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    gcTime: 10 * 60 * 1000,
    persister: withDataClass(),
  },
}

/** Query-level opt-in to focus refetching, for the classes that want it. */
export function refetchesOnFocus(c: DataClass): boolean {
  return REFETCH_ON_FOCUS.has(c)
}

export function createQueryClientConfig(): QueryClientConfig {
  return { defaultOptions: queryDefaults }
}
