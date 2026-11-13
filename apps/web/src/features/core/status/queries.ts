import { coreQueries } from '@/data/core/queries'
import { sdkQueries } from '@/data/sdk/queries'
import type { NetworkId } from '@/lib/network'

const TIP_POLL_MS = 30_000
const PLATFORM_POLL_MS = 15_000

/** The status page's reads: the Core queries every page shares, polled while the page is open. */
export const statusQueries = {
  tip: (net: NetworkId) => ({ ...coreQueries.tip(net), refetchInterval: TIP_POLL_MS }),
  chainLock: (net: NetworkId) => ({ ...coreQueries.chainLock(net), refetchInterval: TIP_POLL_MS }),
  chain: (net: NetworkId) => ({ ...coreQueries.status(net), refetchInterval: TIP_POLL_MS }),
  platform: (net: NetworkId) => ({
    ...sdkQueries['system.status'](net, {}),
    refetchInterval: PLATFORM_POLL_MS,
  }),
}
