import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { DecodedTx } from '@/data/core/types'
import type { HyTxDetail } from '@/data/hyphen/schemas'
import { hyQueries } from '@/data/hyphen/queries'
import { viewKeys } from '@/data/query'
import type { NetworkId } from '@/lib/network'
import { findSpender, limiter, outputSpends, type OutputSpend, type Spender } from './spend'

const ADDRESS_PAGE = 100
const lookups = limiter(3)

/**
 * The spend state of each output. Where Hyphen reports an output spent, the spending transaction is looked
 * up for the first `visible` outputs only, since each lookup is a few Hyphen requests.
 */
export function useOutputSpends({
  net,
  tx,
  mined,
  hy,
  hyLoading,
  tipHeight,
  visible,
}: {
  net: NetworkId
  tx: DecodedTx
  mined: boolean
  hy: { detail: HyTxDetail | null | undefined; asOfHeight: number | undefined } | undefined
  hyLoading: boolean
  tipHeight: number | undefined
  visible: number
}): OutputSpend[] {
  const queryClient = useQueryClient()
  const height = tx.height
  const wanted = tx.outputs.flatMap((o, n) =>
    n < visible && height !== undefined && hy?.detail?.vout.find((v) => v.n === n)?.spent === true
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
  return useMemo(() => {
    const spenders = new Map<number, Spender | null | 'resolving'>()
    wanted.forEach(({ n }, i) => {
      const q = found[i]
      if (!q) return
      spenders.set(n, q.isPending ? 'resolving' : (q.data ?? null))
    })
    return outputSpends({ tx, mined, hy, hyLoading, tipHeight, spenders })
    // `found` changes identity every render; its settled contents are summed up in `resultKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx, mined, hy, hyLoading, tipHeight, resultKey])
}
