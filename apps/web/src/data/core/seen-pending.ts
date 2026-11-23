import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
/** How many transactions are kept to count and sum: on a chain with no blocks the list would otherwise grow for ever. */
export const SEEN_STORE_LIMIT = 5000
const TICK_MS = 10_000
const NONE: ReadonlySet<string> = new Set()

interface Scoped {
  net: NetworkId
  rows: SeenTx[]
  /** The transactions of the last few blocks the feed reported, so a list read from an index can drop them too. */
  mined: ReadonlySet<string>
  /** When the feed delivered its first transaction on `net`. */
  firstAt?: number
}

/** Blocks whose transactions `mined` keeps: an index read just after a block may not have taken it in yet. */
const MINED_BLOCKS_KEPT = 3

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
 * The provenance stamp of DAPI's live transaction feed: as of now while the stream is connected, however quiet it is,
 * and as of the moment it was last connected once it is not. A transaction's arrival time is an event, and says
 * nothing about how current the feed is, so it is never used. Undefined for a feed that was never connected.
 */
export function useLiveFeedStamp(net: NetworkId, enabled: boolean): SourceStamp | undefined {
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
  const asOf = connected ? now : lastConnectedAt?.net === net ? lastConnectedAt.at : undefined
  return asOf === undefined ? undefined : { source: 'dapi', asOf, fetchedAt: asOf, proved: false }
}

interface BlockMemory {
  current: { net: NetworkId; txids: string[][] }
}

/** Adds a block's transactions to the last few kept for `net` and returns all of them. */
function rememberBlock(blocks: BlockMemory, net: NetworkId, txids: string[]): ReadonlySet<string> {
  const recent = blocks.current.net === net ? blocks.current.txids : []
  blocks.current = { net, txids: [txids, ...recent].slice(0, MINED_BLOCKS_KEPT) }
  return new Set(blocks.current.txids.flat())
}

/**
 * Transactions DAPI's live feed has delivered since the page opened, newest first, minus those a block has since
 * confirmed. It stands in for the mempool list while Hyphen's index is behind or Decentralized only mode keeps Hyphen
 * off, and says only what this page saw. `rows` are the newest `limit`; `count` and `bytes` cover everything kept,
 * up to `SEEN_STORE_LIMIT` (`capped` says the oldest were dropped). The stamp is the feed's (`useLiveFeedStamp`).
 */
export function useSeenPending(
  net: NetworkId,
  enabled: boolean,
  limit = MAX_SEEN,
  /** Whether the feed's stamp is shown: keeping it current re-renders every ten seconds. */
  stamped = enabled,
): {
  rows: SeenTx[]
  count: number
  bytes: number
  capped: boolean
  stamp: SourceStamp | undefined
  mined: ReadonlySet<string>
  firstAt: number | undefined
} {
  const [state, setState] = useState<Scoped>({ net, rows: [], mined: NONE })
  const blocks = useRef<{ net: NetworkId; txids: string[][] }>({ net, txids: [] })
  const stamp = useLiveFeedStamp(net, enabled && stamped)
  useEffect(() => {
    if (!enabled) return
    return coreLive.transactions(net, (event) => {
      const minedNow = event.kind === 'block' ? rememberBlock(blocks, net, event.txids) : undefined
      setState((s) => {
        const rows = s.net === net ? s.rows : []
        const mined = s.net === net ? s.mined : NONE
        const firstAt = s.net === net ? s.firstAt : undefined
        if (event.kind === 'tx') {
          if (rows.some((r) => r.txid === event.tx.txid)) return { net, rows, mined, firstAt }
          const row = {
            txid: event.tx.txid,
            type: event.tx.type,
            value: event.tx.outputs.reduce((sum, o) => sum + o.value, 0n),
            size: event.tx.size,
            seenAt: Date.now(),
          }
          return {
            net,
            rows: [row, ...rows].slice(0, SEEN_STORE_LIMIT),
            mined,
            firstAt: firstAt ?? row.seenAt,
          }
        }
        if (minedNow)
          return { net, rows: rows.filter((r) => !minedNow.has(r.txid)), mined: minedNow, firstAt }
        return s
      })
    })
  }, [net, enabled])

  const kept = useMemo(() => (state.net === net ? state.rows : []), [state, net])
  const mined = state.net === net ? state.mined : NONE
  const firstAt = state.net === net ? state.firstAt : undefined
  const bytes = useMemo(() => kept.reduce((n, r) => n + r.size, 0), [kept])
  const rows = useMemo(() => (kept.length > limit ? kept.slice(0, limit) : kept), [kept, limit])
  return {
    rows,
    count: kept.length,
    bytes,
    capped: kept.length >= SEEN_STORE_LIMIT,
    stamp,
    mined,
    firstAt,
  }
}
