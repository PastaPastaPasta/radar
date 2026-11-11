import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
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
  const query = useQuery({ ...hyQueries.mempoolTxs(net, { limit: 20 }), enabled })
  const [held, setHeld] = useState<FirstSeen>()
  const row = query.data?.data.items.find((r) => r.txHash === txid)
  if (row && query.data && held?.at !== row.firstSeenAt) {
    setHeld({ at: row.firstSeenAt, stamp: stampOf(query.data) })
  }
  return held
}
