import type { QueryClientConfig } from '@tanstack/react-query'
import { isSourceError } from '../errors'
import { withDataClass } from './persister'

const MAX_RETRIES = 2
const MIN_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 120_000

/** Kinds worth retrying: transient transport faults and rate limits (§2.3). */
export function retryable(error: unknown): boolean {
  if (!isSourceError(error)) return false
  switch (error.kind) {
    case 'timeout':
      // A reply that was still arriving when the deadline fell will not arrive faster the next time.
      return !error.bytesFlowing
    case 'network':
    case 'rate-limited':
      return true
    case 'http':
      return error.status === undefined || error.status >= 500
    default:
      return false
  }
}

export function retryDelay(attempt: number, error: unknown): number {
  if (isSourceError(error) && error.retryAfterMs !== undefined) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(MIN_RETRY_DELAY_MS, error.retryAfterMs))
  }
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

export function createQueryClientConfig(): QueryClientConfig {
  return { defaultOptions: queryDefaults }
}
