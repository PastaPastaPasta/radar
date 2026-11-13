import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { LoadState } from '@/ui'

export interface QueryView {
  state: LoadState
  error: unknown
  onRetry: () => void
}

/**
 * What a card or table needs to show a query: loading until it has an answer, an error only when nothing is left to
 * show. Spread it onto the `Card` or table that draws the query.
 */
export function queryView(query: {
  data: unknown
  isError: boolean
  error: unknown
  refetch: () => Promise<unknown>
}): QueryView {
  return {
    state: query.data !== undefined ? 'ready' : query.isError ? 'error' : 'loading',
    error: query.error,
    onRetry: () => void query.refetch(),
  }
}

/** The stamps of the answers that have arrived, for a card that draws from one or several. */
export function stampsOf(...answers: (Sourced<unknown> | undefined)[]): SourceStamp[] {
  return answers.flatMap((a) => (a ? [stampOf(a)] : []))
}
