import { useEffect, useState } from 'react'
import { coreLive } from '@/data/core/live'
import type { SourceStamp } from '@/data/envelope'
import type { NetworkId } from '@/lib/network'

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
  stamp?: SourceStamp
}

/**
 * Transactions DAPI's live feed has delivered since the page opened, newest first, minus those a block has since
 * confirmed. It stands in for the mempool list while Hyphen's index is behind, and says only what this page saw.
 */
export function useSeenPending(
  net: NetworkId,
  enabled: boolean,
): { rows: SeenTx[]; stamp: SourceStamp | undefined } {
  const [state, setState] = useState<Scoped>({ net, rows: [] })
  useEffect(() => {
    if (!enabled) return
    return coreLive.transactions(net, (event) => {
      const at = Date.now()
      setState((s) => {
        const rows = s.net === net ? s.rows : []
        if (event.kind === 'tx') {
          if (rows.some((r) => r.txid === event.tx.txid)) return { ...s, net, rows }
          const row = {
            txid: event.tx.txid,
            value: event.tx.outputs.reduce((sum, o) => sum + o.value, 0n),
            size: event.tx.size,
            seenAt: at,
          }
          const stamp: SourceStamp = { source: 'dapi', asOf: at, fetchedAt: at, proved: false }
          return { net, rows: [row, ...rows].slice(0, MAX_SEEN), stamp }
        }
        if (event.kind === 'block') {
          const mined = new Set(event.txids)
          return { ...s, net, rows: rows.filter((r) => !mined.has(r.txid)) }
        }
        return s
      })
    })
  }, [net, enabled])
  return state.net === net
    ? { rows: state.rows, stamp: state.stamp }
    : { rows: [], stamp: undefined }
}
