import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { earlyAnswers } from '@/data/early'
import type { Sourced } from '@/data/envelope'
import { useHyphenFit } from '@/data/hyphen/fit'
import type { NetworkId } from '@/lib/network'

export interface IndexedFirst<T> {
  query: UseQueryResult<Sourced<T | null>>
  /** Hyphen's answer was on screen and DAPI's, when it landed, said something else. */
  differed: boolean
}

/**
 * An index read that answered null (its status read failed, or the index trailed) before the probe found the index
 * current is no verdict: once the probe does, it is asked again. A null it gives after that stands.
 */
export function useAskAgainOnceCurrent(
  on: boolean,
  fit: boolean,
  data: unknown,
  refetch: () => Promise<unknown>,
): void {
  useEffect(() => {
    if (on && fit && data === null) void refetch()
  }, [on, fit, data, refetch])
}

/**
 * Indexed first (§4.7): while DAPI's answer is on its way, a detail page shows Hyphen's, checked against the request
 * and stamped `dapi-cold` ("Indexed by Hyphen · checking with DAPI…"). It is shown only while the probe says Hyphen's
 * index is current (`useHyphenFit`: probed, not stale, not down), so a verdict of stale takes it off the page at once.
 * DAPI's answer replaces it the moment it lands, found or not, and `differed` says when the two disagreed on `same`.
 * Hyphen's miss is never shown, and once DAPI has failed the façade's own stand-in rule decides.
 */
export function useIndexedFirst<T, K extends QueryKey>(
  primary: UseQueryResult<Sourced<T | null>>,
  indexed: UseQueryOptions<Sourced<T> | null, Error, Sourced<T> | null, K>,
  { enabled, net, same }: { enabled: boolean; net: NetworkId; same: (a: T, b: T) => boolean },
): IndexedFirst<T> {
  const fit = useHyphenFit(net)
  const waiting = enabled && earlyAnswers() && primary.data === undefined && !primary.isError
  // The read starts at once (the loader started it too); only the probe's verdict lets it on screen.
  const stand = useQuery({ ...indexed, enabled: waiting })
  useAskAgainOnceCurrent(waiting, fit, stand.data, stand.refetch)
  // The index's answer last put on screen for this request, to say whether DAPI's differed from it.
  const request = JSON.stringify(indexed.queryKey)
  const [shown, setShown] = useState<{ request: string; answer: Sourced<T> } | undefined>(undefined)
  if (waiting && fit && stand.data) {
    if (shown?.request !== request || shown.answer !== stand.data)
      setShown({ request, answer: stand.data })
    return {
      query: { ...primary, data: stand.data } as unknown as UseQueryResult<Sourced<T | null>>,
      differed: false,
    }
  }
  const before = shown?.request === request ? shown.answer.data : undefined
  const after = primary.data?.data
  const differed =
    before !== undefined && primary.data !== undefined && (after == null || !same(before, after))
  return { query: primary, differed }
}
