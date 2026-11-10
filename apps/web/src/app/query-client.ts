import { QueryClient } from '@tanstack/react-query'
import { isSourceError } from '@/data/errors'

export function retryable(e: unknown): boolean {
  if (!isSourceError(e)) return false
  switch (e.kind) {
    case 'network':
    case 'timeout':
    case 'rate-limited':
      return true
    case 'http':
      return e.status === undefined || e.status >= 500
    default:
      return false
  }
}

export function retryDelay(attempt: number, e: unknown): number {
  const after = isSourceError(e) ? e.retryAfterMs : undefined
  return after ?? 1000 * 2 ** attempt
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, e) => count < 2 && retryable(e),
        retryDelay,
      },
    },
  })
}
