import type { ReactNode } from 'react'
import { ErrorState } from '@/ui'

interface GateQuery {
  isPending: boolean
  isError: boolean
  data: unknown
  error: unknown
  refetch: () => unknown
}

/** Shows `skeleton` while an SDK read is pending and the error with a retry when it failed with nothing to show; otherwise `children`. */
export function SdkGate({
  query,
  skeleton,
  compact,
  children,
}: {
  query: GateQuery
  skeleton: ReactNode
  compact?: boolean
  children: ReactNode
}) {
  if (query.isPending) return skeleton
  if (query.isError && !query.data) {
    return (
      <ErrorState
        error={query.error}
        source="sdk"
        {...(compact ? { compact } : {})}
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  return children
}
