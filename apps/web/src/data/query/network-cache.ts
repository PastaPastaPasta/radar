import type { QueryClient } from '@tanstack/query-core'
import type { NetworkId } from '@/lib/network'
import { netKey } from './keys'
import { clearPersistedNetwork } from './persister'

/**
 * Forgets everything cached for one network: in-flight and finished queries in memory, and the
 * persisted copies. A re-saved custom devnet needs this, because the name stays but the nodes
 * behind it may not.
 */
export async function resetNetworkCache(client: QueryClient, net: NetworkId): Promise<void> {
  await client.cancelQueries({ queryKey: netKey(net) })
  client.removeQueries({ queryKey: netKey(net) })
  await clearPersistedNetwork(net)
}
