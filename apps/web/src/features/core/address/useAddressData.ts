import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useIndexHealth } from '@/data/index-health'
import type { NetworkId } from '@/lib/network'
import { addressQueries, insightAddressQueries, type IndexSource } from './queries'

/**
 * What the address page reads: Hyphen's index, or Insight's while Hyphen's is stale (§4.7). Neither is asked
 * until the index health is known, so a stale network never starts a read it would throw away.
 */
export function useAddressData(net: NetworkId, address: string) {
  const index = useIndexHealth(net)
  const insight = index.readFrom === 'insight'
  const hyphen = !insight && !index.pending
  const hy = {
    summary: useQuery({ ...addressQueries.summary(net, address), enabled: hyphen }),
    txs: useInfiniteQuery({ ...addressQueries.txs(net, address), enabled: hyphen }),
    utxos: useQuery({ ...addressQueries.utxos(net, address), enabled: hyphen }),
  }
  const ins = {
    summary: useQuery({ ...insightAddressQueries.summary(net, address), enabled: insight }),
    txs: useInfiniteQuery({ ...insightAddressQueries.txs(net, address), enabled: insight }),
    utxos: useQuery({ ...insightAddressQueries.utxos(net, address), enabled: insight }),
  }
  const from: IndexSource = insight ? 'insight' : 'hyphen'
  return { index, from, ...(insight ? ins : hy) }
}
