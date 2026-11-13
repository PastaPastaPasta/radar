import { useEffect, useState, useSyncExternalStore } from 'react'
import type { SourceStamp } from '../envelope'
import type { NetworkId } from '@/lib/network'
import type { CoreTxType } from '@/lib/tx-types'
import { coreLive } from './live'

export interface SeenTx {
  txid: string
  type: CoreTxType
  value: bigint
  size: number
  /** When this browser received the transaction from DAPI's live feed. */
  seenAt: number
}

const MAX_SEEN = 20
const TICK_MS = 10_000

interface Scoped {
  net: NetworkId
  rows: SeenTx[]
}

let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const tickers = new Set<() => void>()
const idle = () => () => undefined

function subscribeTick(cb: () => void): () => void {
  now = Date.now()
  tickers.add(cb)
  timer ??= setInterval(() => {
    now = Date.now()
    for (const tick of [...tickers]) tick()
  }, TICK_MS)
  return () => {
    tickers.delete(cb)
    if (tickers.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** The time, refreshed every ten seconds while `active`: the age of a connected feed's stamp. */
function useTick(active: boolean): number {
  return useSyncExternalStore(
    active ? subscribeTick : idle,
    () => now,
    () => now,
  )
}

/**
 * Transactions DAPI's live feed has delivered since the page opened, newest first, minus those a block has since
 * confirmed. It stands in for the mempool list while Hyphen's index is behind or Decentralized only mode keeps Hyphen
 * off, and says only what this page saw. `limit` is how many rows are kept.
 *
 * The stamp is the feed's, not a transaction's: it is as of now while the stream is connected, however quiet it is,
 * and as of the moment the stream last was connected once it is not. A transaction's arrival time is an event,
 * and says nothing about how current the list is.
 */
export function useSeenPending(
  net: NetworkId,
  enabled: boolean,
  limit = MAX_SEEN,
): { rows: SeenTx[]; stamp: SourceStamp | undefined } {
  const [state, setState] = useState<Scoped>({ net, rows: [] })
  const connected = useSyncExternalStore(
    (onChange) => coreLive.subscribe(onChange),
    () => enabled && coreLive.txStatus(net).state === 'live',
    () => false,
  )
  const now = useTick(connected)
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
            type: event.tx.type,
            value: event.tx.outputs.reduce((sum, o) => sum + o.value, 0n),
            size: event.tx.size,
            seenAt: Date.now(),
          }
          return { net, rows: [row, ...rows].slice(0, limit) }
        }
        if (event.kind === 'block') {
          const mined = new Set(event.txids)
          return { net, rows: rows.filter((r) => !mined.has(r.txid)) }
        }
        return s
      })
    })
  }, [net, enabled, limit])

  const asOf = connected ? now : lastConnectedAt?.net === net ? lastConnectedAt.at : undefined
  return {
    rows: state.net === net ? state.rows : [],
    stamp:
      asOf === undefined ? undefined : { source: 'dapi', asOf, fetchedAt: asOf, proved: false },
  }
}
