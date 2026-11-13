import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { DecodedTx, PrevOut } from '@/data/core/types'
import { stampOf, type SourceStamp } from '@/data/envelope'
import type { NetworkId } from '@/lib/network'
import { PREVOUT_CHUNK, txQueries } from './queries'

/**
 * The amounts of inputs `first` and later, read one step at a time once `wanted`: a step starts only after the one
 * before it has answered, so a 229-input list never has more than a step's worth of requests in flight, and the
 * transport's own queue paces the rest against the node budget.
 */
export function usePrevoutSteps(net: NetworkId, tx: DecodedTx, first: number, wanted: boolean) {
  const steps = useMemo(() => {
    const out: [number, number][] = []
    for (let from = first; from < tx.inputs.length; from += PREVOUT_CHUNK) {
      out.push([from, Math.min(from + PREVOUT_CHUNK, tx.inputs.length)])
    }
    return out
  }, [first, tx.inputs.length])
  const client = useQueryClient()
  const options = steps.map(([from, to]) => txQueries.prevoutRange(net, tx, from, to))
  // A step is enabled once the one before it has answered, so reads go out one step at a time.
  const results = useQueries({
    queries: options.map((o, i) => ({
      ...o,
      enabled:
        wanted && (i === 0 || client.getQueryState(options[i - 1]!.queryKey)?.status === 'success'),
    })),
  })
  const answered = results.filter((r) => r.isSuccess).length

  const stamp = results.map((r) => r.dataUpdatedAt).join()
  const merged = useMemo(() => {
    const map = new Map<string, PrevOut>()
    const stamps: SourceStamp[] = []
    for (const r of results) {
      if (!r.data) continue
      for (const [k, v] of r.data.data) map.set(k, v)
      stamps.push(stampOf(r.data))
    }
    return { map, stamps }
    // `results` is a new array each render; the answers' times say when its contents changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])

  const failed = results.some((r) => r.isError)
  return {
    map: merged.map,
    stamps: merged.stamps,
    /** How many inputs have their amounts, counting the first `first`. */
    loaded: Math.min(
      tx.inputs.length,
      first + steps.slice(0, answered).reduce((n, [from, to]) => n + (to - from), 0),
    ),
    loading: wanted && answered < steps.length && !failed,
    failed,
    retry: () => {
      for (const r of results) if (r.isError) void r.refetch()
    },
  }
}
