import type { NetworkId } from '@/lib/network'
import { hyphen } from './client'
import type { HyStreamEvent } from './schemas'

/**
 * Opens Hyphen's event stream. Only the address page uses it (IN-06 new-transaction notice), so the
 * raw stream stays out of `hyQueries` and `data/hyphen/index.ts` (§5.5).
 */
export function openAddressEvents(
  net: NetworkId,
  signal?: AbortSignal,
): Promise<AsyncIterable<HyStreamEvent>> {
  return hyphen.stream(net, signal)
}
