import type { QueryClient } from '@tanstack/query-core'
import type { NetworkId } from '@/lib/network'
import { netKey } from './keys'
import { clearPersistedNetwork } from './persister'

const resetHooks = new Set<(net: NetworkId) => void>()

/** Lets a lazily loaded data module forget its own memory of a network when that network is reset. */
export function onNetworkReset(hook: (net: NetworkId) => void): void {
  resetHooks.add(hook)
}

/**
 * Forgets everything cached for one network: in-flight and finished queries in memory, and the
 * persisted copies. A re-saved custom devnet needs this, because the name stays but the nodes
 * behind it may not.
 */
export async function resetNetworkCache(client: QueryClient, net: NetworkId): Promise<void> {
  await client.cancelQueries({ queryKey: netKey(net) })
  client.removeQueries({ queryKey: netKey(net) })
  await clearPersistedNetwork(net)
  for (const hook of resetHooks) hook(net)
}
