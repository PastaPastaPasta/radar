import { useEffect, useState } from 'react'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { LoadState } from '@/ui'

interface QueryView {
  state: LoadState
  error: unknown
  onRetry: () => void
}

/** What a card or table needs to show a query: loading until it has an answer, an error only when nothing is left to show. */
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

/** The stamps of the answers that have arrived. */
export function stampsOf(...answers: (Sourced<unknown> | undefined)[]): SourceStamp[] {
  return answers.flatMap((a) => (a ? [stampOf(a)] : []))
}

/** True once the browser has had an idle moment after first paint, so loading the SDK never competes with it (§3.3). */
export function useAfterIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback
    const cancel = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
    if (!ric) {
      const timer = setTimeout(() => setIdle(true), 1)
      return () => clearTimeout(timer)
    }
    const id = ric(() => setIdle(true))
    return () => cancel?.(id)
  }, [])
  return idle
}
