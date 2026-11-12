import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { coreLive } from '@/data/core/live'
import { mapSourced } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import { insQueries } from '@/data/insight/queries'
import { POLL_MS } from '@/data/query/stale'
import type { NetworkId } from '@/lib/network'
import {
  addressKeys,
  knownOutputValue,
  txRows,
  utxosWorthRefreshing,
  type IndexSource,
} from './queries'
import { watchAddress, type PendingTx, type WatchStatus } from './live'

export interface AddressActivity {
  status: WatchStatus
  /** Unconfirmed transactions that touch the address, newest first. */
  pending: PendingTx[]
  /** The newest transaction seen since this page opened, pending or not. */
  latest?: PendingTx
  /** Transactions seen since this page opened, counting those that have since confirmed. */
  arrived: number
}

/** How many of the address's newest transactions the fallback reads. */
const RECENT_LIMIT = 10

const FRESH = { staleTime: 0 } as const

const pageVisibility = {
  hidden: () => document.hidden,
  subscribe(onChange: () => void) {
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  },
}

/** Stops waiting for `work` when `signal` aborts; the query itself is left to finish on its own. */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    })
    work.then(resolve, reject)
  })
}

type Scoped = AddressActivity & { scope: string }

const fresh = (scope: string): Scoped => ({ scope, status: 'connecting', pending: [], arrived: 0 })

/** State from an earlier address or network never shows on the current one. */
const current = (s: Scoped, scope: string): Scoped => (s.scope === scope ? s : fresh(scope))

/**
 * Follows new transactions of the address while its page is on screen (§5.5): DAPI's live transaction feed, and
 * the history of the address (Hyphen's, or Insight's while Hyphen's index is stale) only while that feed has
 * given up.
 */
export function useAddressActivity(
  net: NetworkId,
  address: string,
  enabled: boolean,
  from: IndexSource = 'hyphen',
): AddressActivity {
  const queryClient = useQueryClient()
  const scope = `${net}:${address}`
  const [state, setState] = useState<Scoped>(() => fresh(scope))
  const pendingRef = useRef<PendingTx[]>([])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    pendingRef.current = []
    const keep = (next: PendingTx[]) => {
      if (next.length === pendingRef.current.length) return
      pendingRef.current = next
      setState((s) => ({ ...current(s, scope), pending: next }))
    }
    watchAddress({
      address,
      signal: controller.signal,
      dapi: {
        transactions: (listener) => coreLive.transactions(net, listener),
        status: () => coreLive.txStatus(net),
        subscribe: (onChange) => coreLive.subscribe(onChange),
      },
      recent: (signal) =>
        from === 'insight'
          ? untilAborted(
              queryClient.fetchQuery({ ...insQueries.addressTxs(net, address, 0), ...FRESH }),
              signal,
            ).then((page) => mapSourced(page, (p) => txRows(address, p)))
          : untilAborted(
              queryClient.fetchQuery({
                ...hyQueries.addressTxs(net, address, { limit: RECENT_LIMIT }),
                ...FRESH,
              }),
              signal,
            ).then((page) => mapSourced(page, (p) => p.items)),
      spendable: (outpoint) => knownOutputValue(queryClient, net, address, from, outpoint),
      every: POLL_MS.addressFallback,
      visibility: pageVisibility,
      onStatus: (status) => {
        setState((s) => ({ ...current(s, scope), status }))
      },
      onPending: (tx) => {
        if (!tx.confirmed) pendingRef.current = [tx, ...pendingRef.current]
        setState((s) => {
          const c = current(s, scope)
          return { ...c, pending: pendingRef.current, latest: tx, arrived: c.arrived + 1 }
        })
      },
      onBlock: (mined) => {
        const keys = addressKeys(net, address, from)
        void queryClient.invalidateQueries({ queryKey: keys.summary })
        void queryClient.invalidateQueries({ queryKey: keys.txs })
        void queryClient.invalidateQueries({
          queryKey: keys.utxos,
          predicate: utxosWorthRefreshing,
        })
        if (mined) {
          keep(pendingRef.current.filter((p) => !mined.has(p.txid)))
          return
        }
        for (const p of pendingRef.current) {
          const mined =
            from === 'insight'
              ? queryClient
                  .fetchQuery({ ...insQueries.tx(net, p.txid), ...FRESH })
                  .then((tx) => (tx.data?.blockheight ?? -1) >= 0)
              : queryClient
                  .fetchQuery({ ...hyQueries.tx(net, p.txid), ...FRESH })
                  .then((tx) => tx.data?.blockHeight != null)
          void mined
            .then((isMined) => {
              if (controller.signal.aborted || !isMined) return
              keep(pendingRef.current.filter((q) => q.txid !== p.txid))
            })
            .catch(() => undefined)
        }
      },
    })
    return () => {
      controller.abort()
    }
  }, [net, address, enabled, from, queryClient, scope])

  return current(state, scope)
}
