import { isPlatformId } from '@/lib/base58'
import type { PeQuery } from './params'

export interface TokensSearch {
  page: number
  limit: number
  sort?: string | undefined
  owner?: string | undefined
  contract?: string | undefined
  q?: string | undefined
}

/** `sort=-date` lists the newest tokens first; Platform Explorer's own order (oldest first) is the default. */
export const NEWEST_FIRST = '-date'

const NAME_PREFIX = /^[A-Za-z0-9-]{1,25}$/

/** What `q` asks of Platform Explorer: a token ID, or the start of a token's name. */
export function textFilter(q: string): PeQuery {
  if (isPlatformId(q)) return { token_id: q }
  return NAME_PREFIX.test(q) ? { token_name: q } : {}
}

/** Platform Explorer's names for what the address filters on. */
export function tokensQuery(search: TokensSearch): PeQuery {
  const query: Record<string, string> = {}
  if (search.sort === NEWEST_FIRST) query.order = 'desc'
  if (search.owner) query.owner = search.owner
  if (search.contract) query.contract_id = search.contract
  return { ...query, ...(search.q ? textFilter(search.q) : {}) }
}
