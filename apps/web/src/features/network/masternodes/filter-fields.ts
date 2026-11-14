import type { MnFilter } from '@/data/masternodes/filter'

const FILTER_FIELDS = ['q', 'type', 'status', 'reach', 'country', 'version', 'host', 'dkg'] as const

/** The filter fields the address carries, for a link to another page that reads the same ones. */
export function filterFields(search: MnFilter): MnFilter {
  return Object.fromEntries(
    FILTER_FIELDS.flatMap((k) => (search[k] === undefined ? [] : [[k, search[k]]])),
  )
}
