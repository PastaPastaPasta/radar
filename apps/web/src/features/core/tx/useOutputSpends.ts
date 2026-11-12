import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { DecodedTx } from '@/data/core/types'
import type { HyTxDetail } from '@/data/hyphen/schemas'
import { hyQueries } from '@/data/hyphen/queries'
import { useIndexHealth } from '@/data/index-health'
import { insQueries } from '@/data/insight/queries'
import { viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'
import {
  findSpender,
  flaggedSpent,
  insightSpendsOf,
  isUnspendable,
  limiter,
  outputSpends,
  type AddressUtxos,
  type OutputSpend,
  type Spender,
} from './spend'

const ADDRESS_PAGE = 100
const UTXO_MAX_PAGES = 3
const lookups = limiter(3)
const NO_SPENDERS = new Map<number, Spender | null | 'resolving'>()

/**
 * The spend state of each output of the first `visible`. Hyphen's transaction page is cached for as long as
 * the transaction is mined, so unless it already says spent, the output address's current UTXO list decides:
 * an output still in it is unspent, one missing from a complete list is spent. For spent outputs the spending
 * transaction is then looked up, which costs a few Hyphen requests each.
 *
 * While Hyphen is fit it stays the source of all of that. Insight's `/tx` (one request for the whole
 * transaction) is read only while Hyphen's index is stale (`insightFirst`), or when Hyphen says an output is spent
 * and its search finds no spender; a spender Insight names is final, while its "unspent" never overrules Hyphen.
 */
export function useOutputSpends({
  net,
  tx,
  mined,
  hy,
  hyLoading,
  insightFirst,
  tipHeight,
  visible,
}: {
  net: NetworkId
  tx: DecodedTx
  mined: boolean
  hy: { detail: HyTxDetail | null | undefined; asOfHeight: number | undefined } | undefined
  hyLoading: boolean
  /** Hyphen's index is stale, so Insight answers instead of it. */
  insightFirst: boolean
  tipHeight: number | undefined
  visible: number
}): OutputSpend[] {
  const queryClient = useQueryClient()
  const height = tx.height
  const hyphenFit = hy?.detail != null
  const mayHaveUtxos = mined && height !== undefined && hyphenFit
  const outputsAt = new Map<string, number[]>()
  if (mayHaveUtxos) {
    tx.outputs.forEach((o, n) => {
      if (n >= visible || !o.address || isUnspendable(o.scriptPubKey) || flaggedSpent(hy, n)) return
      outputsAt.set(o.address, [...(outputsAt.get(o.address) ?? []), n])
    })
  }
  const utxoAddresses = [...outputsAt.keys()]
  const utxoQueries = useQueries({
    queries: utxoAddresses.map((address) => ({
      queryKey: viewKeys(net, 'tx-utxos', { txid: tx.txid, address }),
      queryFn: ({ signal }: { signal: AbortSignal }): Promise<AddressUtxos> =>
        lookups(async () => {
          const found = new Set<number>()
          let cursor: string | undefined
          let asOf: number | undefined
          for (let page = 0; page < UTXO_MAX_PAGES; page++) {
            signal.throwIfAborted()
            const res = await queryClient.fetchQuery(
              hyQueries.addressUtxos(net, address, { limit: ADDRESS_PAGE, cursor }),
            )
            asOf = res.height ?? res.data.asOfHeight
            for (const u of res.data.items) if (u.txHash === tx.txid) found.add(u.vout)
            if (!res.data.nextCursor) return { asOf, found, complete: true }
            if ((outputsAt.get(address) ?? []).every((n) => found.has(n))) break
            cursor = res.data.nextCursor
          }
          return { asOf, found, complete: false }
        }),
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
    })),
  })
  const utxoKey = utxoQueries
    .map(
      (q) =>
        `${q.status}:${q.data?.asOf ?? ''}:${q.data?.complete ?? ''}:${[...(q.data?.found ?? [])].join(',')}`,
    )
    .join('|')
  const utxos = useMemo(() => {
    const byAddress = new Map<string, AddressUtxos | 'resolving' | null>()
    utxoAddresses.forEach((address, i) => {
      const q = utxoQueries[i]
      if (q) byAddress.set(address, q.isPending ? 'resolving' : (q.data ?? null))
    })
    return byAddress
    // `utxoQueries` changes identity every render; its settled contents are summed up in `utxoKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utxoKey])
  const spent = outputSpends({
    tx,
    mined,
    hy,
    hyLoading,
    tipHeight,
    spenders: NO_SPENDERS,
    utxos,
  })
  const wanted = tx.outputs.flatMap((o, n) =>
    n < visible && height !== undefined && spent[n]?.state === 'spent' && hyphenFit
      ? [{ n, address: o.address }]
      : [],
  )
  const found = useQueries({
    queries: wanted.map(({ n, address }) => ({
      queryKey: viewKeys(net, 'tx-spender', { txid: tx.txid, n }),
      queryFn: ({ signal }: { signal: AbortSignal }): Promise<Spender | null> =>
        lookups(() =>
          findSpender(
            {
              addressTxs: async (a, cursor) => {
                const page = await queryClient.fetchQuery(
                  hyQueries.addressTxs(net, a, { limit: ADDRESS_PAGE, cursor }),
                )
                return { items: page.data.items, nextCursor: page.data.nextCursor }
              },
              inputsOf: async (id) => {
                const page = await queryClient.fetchQuery(hyQueries.tx(net, id))
                return page.data?.vin ?? null
              },
            },
            { txid: tx.txid, vout: n, address, height: height ?? 0 },
            signal,
          ),
        ),
      staleTime: Infinity,
      gcTime: 10 * 60_000,
      retry: 1,
    })),
  })
  const resultKey = found
    .map((q) => `${q.status}:${q.data?.txid ?? ''}:${q.data?.vin ?? ''}`)
    .join('|')
  const spenderMissing = found.some((q) => q.isSuccess && q.data === null)
  const readInsight = mined && (insightFirst || spenderMissing)
  useIndexHealth(net, { insight: readInsight })
  const ins = useQuery({ ...insQueries.tx(net, tx.txid), enabled: readInsight })
  const insight = useMemo(() => insightSpendsOf(ins.data?.data), [ins.data])
  const insightPending = readInsight && ins.isPending && ins.fetchStatus !== 'idle'
  const loading = hyLoading || (insightFirst && insightPending)
  return useMemo(() => {
    const spenders = new Map<number, Spender | null | 'resolving'>()
    wanted.forEach(({ n }, i) => {
      const q = found[i]
      if (!q) return
      spenders.set(n, q.isPending ? 'resolving' : (q.data ?? null))
    })
    return outputSpends({
      tx,
      mined,
      hy,
      hyLoading: loading,
      tipHeight,
      spenders,
      utxos,
      insight,
      insightPending,
    })
    // `found` changes identity every render; its settled contents are summed up in `resultKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, mined, hy, loading, insight, insightPending, tipHeight, utxos, resultKey])
}
