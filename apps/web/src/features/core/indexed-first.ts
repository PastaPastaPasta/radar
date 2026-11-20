import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { earlyAnswers } from '@/data/early'
import type { Sourced } from '@/data/envelope'

/**
 * Indexed first (§4.7): while DAPI's answer is on its way, a detail page shows Hyphen's, checked against the request
 * and stamped `dapi-cold` ("Indexed by Hyphen · checking with DAPI…"). DAPI's answer replaces it the moment it lands,
 * found or not. Hyphen's miss is never shown, and once DAPI has failed the façade's own stand-in rule decides.
 */
export function useIndexedFirst<T, K extends QueryKey>(
  primary: UseQueryResult<Sourced<T | null>>,
  indexed: UseQueryOptions<Sourced<T> | null, Error, Sourced<T> | null, K>,
  enabled: boolean,
): UseQueryResult<Sourced<T | null>> {
  const waiting = enabled && earlyAnswers() && primary.data === undefined && !primary.isError
  const stand = useQuery({ ...indexed, enabled: waiting })
  if (!waiting || !stand.data) return primary
  return { ...primary, data: stand.data } as unknown as UseQueryResult<Sourced<T | null>>
}
