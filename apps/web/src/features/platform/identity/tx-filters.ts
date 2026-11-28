import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { Sourced } from '@/data/envelope'
import type { Page } from '@/data/page'
import type { PeQuery } from '@/data/pe/params'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import { txsQuery } from '@/data/pe/transitions-query'
import type { NetworkId } from '@/lib/network'
import type { NumericRange } from '@/lib/search-schemas'
import { transitionTarget, type TransitionTarget } from '@/lib/transition-contract'
import type { TransitionType } from '@/lib/tx-types'
import { PE_PAGE } from './common'

/** The Transitions tab's filters, as the address holds them. */
export interface IdentityTxFilters {
  txtype?: TransitionType[] | undefined
  batch?: string[] | undefined
  status?: 'success' | 'fail' | undefined
  gas?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
  /** `contract` belongs to the Groups and Advanced tabs. */
  txcontract?: string | undefined
}

export const TX_FILTER_KEYS = [
  'txtype',
  'batch',
  'status',
  'gas',
  'from',
  'to',
  'txcontract',
] as const satisfies readonly (keyof IdentityTxFilters)[]

/** The transition types whose bytes name a data contract; the rest never match a contract filter. */
export const CONTRACT_TYPES: TransitionType[] = [
  'data-contract-create',
  'data-contract-update',
  'batch',
  'masternode-vote',
  'contract-user-moderation',
  'contract-fee-claim',
  'token-shielded-transfer-with-shielded-fee',
  'token-unshield-with-shielded-fee',
  'token-purchase-from-shielded-pool',
]

/** Platform Explorer's largest page: the contract filter reads this many transitions per request. */
export const SCAN_PAGE = 100

export const hasTxFilter = (f: IdentityTxFilters): boolean =>
  TX_FILTER_KEYS.some((k) => {
    const v = f[k]
    return Array.isArray(v) ? v.length > 0 : v !== undefined
  })

/**
 * How the tab reads its list. Unfiltered, it is `/identity/:id/transactions` (what the identity sent and what it
 * received). Filtered, it is `/transactions?owner=:id`, which Platform Explorer narrows by type, batch type, status,
 * gas and date, and which lists only what the identity signed, as Platform Explorer's own identity page does.
 * Platform Explorer cannot narrow by contract, so a contract filter reads full pages of the types that can name one
 * and keeps the rows whose bytes name that contract.
 */
export function identityTxsPlan(
  id: string,
  f: IdentityTxFilters,
):
  | { filtered: false; limit: number }
  | { filtered: true; limit: number; query: PeQuery; matchesNothing: boolean } {
  if (!hasTxFilter(f)) return { filtered: false, limit: PE_PAGE }
  if (!f.txcontract)
    return { filtered: true, limit: PE_PAGE, query: ownerQuery(id, f), matchesNothing: false }
  // A batch type is a batch, which names a contract; of the chosen types, only those that can name one are read.
  const txtype =
    (f.batch?.length ?? 0) > 0
      ? f.txtype
      : (f.txtype ?? CONTRACT_TYPES).filter((t) => CONTRACT_TYPES.includes(t))
  return {
    filtered: true,
    limit: SCAN_PAGE,
    query: ownerQuery(id, { ...f, txtype }),
    matchesNothing: txtype?.length === 0,
  }
}

const ownerQuery = (id: string, f: IdentityTxFilters): PeQuery =>
  txsQuery({
    page: 1,
    limit: PE_PAGE,
    type: f.txtype,
    batch: f.batch,
    status: f.status,
    gas: f.gas,
    owner: id,
    from: f.from,
    to: f.to,
    sort: '-time',
  })

const targets = new WeakMap<PeTransaction, TransitionTarget | null>()

/** The contract a row's transition acts on, read once per row. */
export function rowTarget(row: PeTransaction): TransitionTarget | undefined {
  let found = targets.get(row)
  if (found === undefined) {
    found = transitionTarget(row.data) ?? null
    targets.set(row, found)
  }
  return found ?? undefined
}

export interface UsedContract {
  id: string
  /** Transitions seen that act on it. */
  count: number
  /** Document types seen, in the order first met. */
  types: string[]
}

/** Pages of `SCAN_PAGE` the picker reads before it asks to look further back. */
const SCAN_STEP = 2

const hasMore = (p: Sourced<Page<PeTransaction>>, page: number) =>
  p.data.total === undefined ? p.data.items.length >= SCAN_PAGE : page * SCAN_PAGE < p.data.total

/**
 * The contracts an identity's own transitions act on, newest first, read only while `enabled` (the picker is open).
 * It reads the same pages a contract filter with no other filter reads, so either one fills the cache for the other,
 * one request per page and one page at a time.
 */
export function useUsedContracts(net: NetworkId, id: string, enabled: boolean) {
  const client = useQueryClient()
  const [cap, setCap] = useState(SCAN_STEP)
  const query = ownerQuery(id, { txtype: CONTRACT_TYPES })
  const pageQuery = (page: number) =>
    peQueries.transactions(net, { ...query, page, limit: SCAN_PAGE })
  const landed = (page: number) =>
    client.getQueryData<Sourced<Page<PeTransaction>>>(pageQuery(page).queryKey)
  const results = useQueries({
    queries: Array.from({ length: cap }, (_, i) => {
      const before = i === 0 ? undefined : landed(i)
      return {
        ...pageQuery(i + 1),
        enabled: enabled && (i === 0 || (!!before && hasMore(before, i))),
      }
    }),
  })

  const byId = new Map<string, UsedContract>()
  let scanned = 0
  const seen = new Set<string>()
  let more = false
  let pending = false
  let failed = false
  for (const [i, r] of results.entries()) {
    if (!r.data) {
      pending ||= r.isFetching || (r.isPending && enabled && i === 0)
      failed ||= r.isError
      break
    }
    for (const row of r.data.data.items) {
      // A transition that landed between two reads shows up on both pages.
      if (seen.has(row.hash)) continue
      seen.add(row.hash)
      scanned += 1
      const target = rowTarget(row)
      if (!target) continue
      const used = byId.get(target.contract) ?? { id: target.contract, count: 0, types: [] }
      used.count += 1
      if (target.documentType && !used.types.includes(target.documentType))
        used.types.push(target.documentType)
      byId.set(target.contract, used)
    }
    more = hasMore(r.data, i + 1)
    if (!more) break
  }
  return {
    contracts: [...byId.values()].sort((a, b) => b.count - a.count),
    scanned,
    pending,
    failed,
    /** The scan stopped at its cap with older transitions left. */
    more: more && !pending,
    scanMore: () => {
      setCap((c) => c + SCAN_STEP)
    },
    retry: () => {
      for (const r of results) if (r.isError) void r.refetch()
    },
  }
}
