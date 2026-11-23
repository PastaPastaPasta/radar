import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { recentMempoolTxs } from '@/data/hyphen/queries'
import { MEMPOOL_REREAD_DELAY_MS } from '@/data/query/stale'
import type { NetworkId } from '@/lib/network'

export interface FirstSeen {
  at: number
  stamp: SourceStamp
}

/**
 * When the mempool first saw a transaction. Hyphen keeps that only while the transaction is unconfirmed, so
 * the time is held once seen: the page stays open as the transaction is mined, and the received time is not
 * lost with it. A transaction first opened after it was mined has no first-seen time anywhere.
 */
export function useFirstSeen(
  net: NetworkId,
  txid: string,
  { enabled }: { enabled: boolean },
): FirstSeen | undefined {
  const query = useQuery({ ...recentMempoolTxs(net), enabled })
  const [held, setHeld] = useState<FirstSeen>()
  const row = query.data?.data.items.find((r) => r.txHash === txid)
  const missing = enabled && query.isSuccess && !row
  const client = useQueryClient()
  // A transaction opened just after it was broadcast may not be indexed yet: look once more, a moment later.
  useEffect(() => {
    if (!missing) return
    const timer = setTimeout(
      () =>
        void client.invalidateQueries({ queryKey: recentMempoolTxs(net).queryKey, exact: true }),
      MEMPOOL_REREAD_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [missing, client, net, txid])
  if (row && query.data && held?.at !== row.firstSeenAt) {
    setHeld({ at: row.firstSeenAt, stamp: stampOf(query.data) })
  }
  return held
}
