import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { LoadState } from '@/ui'

/** A query's card state: loading until it has an answer, an error only when nothing is left to show. */
export function cardState(query: {
  data: unknown
  isError: boolean
  isPending: boolean
}): LoadState {
  if (query.data !== undefined) return 'ready'
  return query.isError ? 'error' : 'loading'
}

/** The stamps of the answers that have arrived, for a card that draws from several. */
export function stampsOf(...answers: (Sourced<unknown> | undefined)[]): SourceStamp[] {
  return answers.flatMap((a) => (a ? [stampOf(a)] : []))
}
