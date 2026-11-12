import { useEffect, useState, useSyncExternalStore } from 'react'
import { coreLive } from '@/data/core/live'
import type { SourceStamp } from '@/data/envelope'
import type { NetworkId } from '@/lib/network'
import { useNow } from '@/ui'

export interface SeenTx {
  txid: string
  value: bigint
  size: number
  /** When this browser received the transaction from DAPI's live feed. */
  seenAt: number
}

const MAX_SEEN = 20

interface Scoped {
  net: NetworkId
  rows: SeenTx[]
}

/**
 * Transactions DAPI's live feed has delivered since the page opened, newest first, minus those a block has since
 * confirmed. It stands in for the mempool list while Hyphen's index is behind, and says only what this page saw.
 *
 * The stamp is the feed's, not a transaction's: it is as of now while the stream is connected, however quiet it is,
 * and as of the moment the stream last was connected once it is not. A transaction's arrival time is an event,
 * and says nothing about how current the list is.
 */
export function useSeenPending(
  net: NetworkId,
  enabled: boolean,
): { rows: SeenTx[]; stamp: SourceStamp | undefined } {
  const [state, setState] = useState<Scoped>({ net, rows: [] })
  const connected = useSyncExternalStore(
    (onChange) => coreLive.subscribe(onChange),
    () => enabled && coreLive.txStatus(net).state === 'live',
    () => false,
  )
  const now = useNow(connected)
  const [lastConnectedAt, setLastConnectedAt] = useState<{ net: NetworkId; at: number }>()
  useEffect(() => {
    if (!connected) return
    return () => setLastConnectedAt({ net, at: Date.now() })
  }, [connected, net])

  useEffect(() => {
    if (!enabled) return
    return coreLive.transactions(net, (event) => {
      setState((s) => {
        const rows = s.net === net ? s.rows : []
        if (event.kind === 'tx') {
          if (rows.some((r) => r.txid === event.tx.txid)) return { net, rows }
          const row = {
            txid: event.tx.txid,
            value: event.tx.outputs.reduce((sum, o) => sum + o.value, 0n),
            size: event.tx.size,
            seenAt: Date.now(),
          }
          return { net, rows: [row, ...rows].slice(0, MAX_SEEN) }
        }
        if (event.kind === 'block') {
          const mined = new Set(event.txids)
          return { net, rows: rows.filter((r) => !mined.has(r.txid)) }
        }
        return s
      })
    })
  }, [net, enabled])

  const asOf = connected ? now : lastConnectedAt?.net === net ? lastConnectedAt.at : undefined
  return {
    rows: state.net === net ? state.rows : [],
    stamp:
      asOf === undefined ? undefined : { source: 'dapi', asOf, fetchedAt: asOf, proved: false },
  }
}
