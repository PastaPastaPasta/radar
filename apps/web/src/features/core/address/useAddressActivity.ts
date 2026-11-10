import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { openAddressEvents } from '@/data/hyphen/live'
import { hyQueries } from '@/data/hyphen/queries'
import type { NetworkId } from '@/lib/network'
import { addressKeys } from './queries'
import { watchAddress, type PendingTx } from './live'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting'

export interface AddressActivity {
  status: LiveStatus
  /** Unconfirmed transactions that touch the address, newest first. */
  pending: PendingTx[]
  /** Transactions seen since this page opened, counting those that have since confirmed. */
  arrived: number
}

const FRESH = { staleTime: 0 } as const

type Scoped = AddressActivity & { scope: string }

const fresh = (scope: string): Scoped => ({ scope, status: 'connecting', pending: [], arrived: 0 })

/** State from an earlier address or network never shows on the current one. */
const current = (s: Scoped, scope: string): Scoped => (s.scope === scope ? s : fresh(scope))

/** Opens Hyphen's event stream while the address page is on screen (§5.5). */
export function useAddressActivity(
  net: NetworkId,
  address: string,
  enabled: boolean,
): AddressActivity {
  const queryClient = useQueryClient()
  const scope = `${net}:${address}`
  const [state, setState] = useState<Scoped>(() => fresh(scope))
  const pendingRef = useRef<PendingTx[]>([])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    pendingRef.current = []
    void watchAddress({
      address,
      signal: controller.signal,
      open: (signal) => openAddressEvents(net, signal),
      fetchTx: (txid) => queryClient.fetchQuery({ ...hyQueries.tx(net, txid), ...FRESH }),
      onStatus: (status) => {
        setState((s) => ({ ...current(s, scope), status }))
      },
      onPending: (tx) => {
        if (pendingRef.current.some((p) => p.txid === tx.txid)) return
        pendingRef.current = [tx, ...pendingRef.current]
        setState((s) => {
          const c = current(s, scope)
          return { ...c, pending: pendingRef.current, arrived: c.arrived + 1 }
        })
      },
      onBlock: () => {
        const keys = addressKeys(net, address)
        void queryClient.invalidateQueries({ queryKey: keys.summary })
        void queryClient.invalidateQueries({ queryKey: keys.txs })
        void queryClient.invalidateQueries({ queryKey: keys.utxos })
        for (const p of pendingRef.current) {
          void queryClient
            .fetchQuery({ ...hyQueries.tx(net, p.txid), ...FRESH })
            .then((fresh) => {
              if (controller.signal.aborted || fresh.data?.blockHeight == null) return
              pendingRef.current = pendingRef.current.filter((q) => q.txid !== p.txid)
              setState((s) => ({ ...current(s, scope), pending: pendingRef.current }))
            })
            .catch(() => undefined)
        }
      },
    })
    return () => {
      controller.abort()
    }
  }, [net, address, enabled, queryClient, scope])

  return current(state, scope)
}
