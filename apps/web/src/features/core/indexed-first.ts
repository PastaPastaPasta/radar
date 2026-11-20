import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useState } from 'react'
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
  // The index's answer last put on screen, to say whether DAPI's differed from it.
  const [shown, setShown] = useState<Sourced<T> | undefined>(undefined)
  if (waiting && fit && stand.data) {
    if (shown !== stand.data) setShown(stand.data)
    return {
      query: { ...primary, data: stand.data } as unknown as UseQueryResult<Sourced<T | null>>,
      differed: false,
    }
  }
  const before = shown?.data
  const after = primary.data?.data
  const differed =
    before !== undefined && primary.data !== undefined && (after == null || !same(before, after))
  return { query: primary, differed }
}
