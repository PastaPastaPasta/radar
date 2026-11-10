import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { SourceStamp, Sourced } from '@/data/envelope'
import { ErrorState, Skeleton } from './states'

export interface QueryViewProps<T> {
  query: UseQueryResult<Sourced<T>>
  skeleton?: ReactNode
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  children: (data: T, stamp: SourceStamp) => ReactNode
}

export function QueryView<T>({ query, skeleton, isEmpty, empty, children }: QueryViewProps<T>) {
  if (query.isPending) return <>{skeleton ?? <Skeleton shape="block" />}</>
  if (query.isError && query.data === undefined) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  const { data, ...stamp } = query.data
  if (isEmpty?.(data)) return <>{empty}</>
  return <>{children(data, stamp)}</>
}
